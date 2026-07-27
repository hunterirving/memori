(function () {
	var MM = 72 / 25.4;         // mm -> PDF points
	var DPI = 600;              // photo raster resolution
	var JPEG_QUALITY = 0.95;	// near lossless
	var PX = DPI / 25.4;        // mm -> canvas px
	var GRID_GRAY = 0xd0 / 0xff;// print grid line color (style.css --default-grid #d0d0d0)
	var LINE_PT = 0.75;         // grid line width in points (1 CSS px)
	var DASH_MM = 0.75;         // dash length
	var GAP_MM = 0.4;           // nominal gap; sets dashes-per-cell, then absorbs rounding slack

	function num(n) {
		var s = n.toFixed(6).replace(/\.?0+$/, "");
		return s === "-0" ? "0" : s;
	}

	// Uint8Array -> binary string (one char per byte) so string length == byte length
	function bytesToBinary(bytes) {
		var CHUNK = 0x8000;
		var parts = [];
		for (var i = 0; i < bytes.length; i += CHUNK) {
			parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
		}
		return parts.join("");
	}

	function createPdf(widthPt, heightPt) {
		var ops = [];
		var xobjects = []; // embedded JPEG images, in draw order
		var lastGray = null;

		// filled rect anchored at its bottom-left; gray 0 = black, 1 = white
		function rect(x, y, w, h, gray) {
			var g = gray || 0;
			if (g !== lastGray) {
				ops.push(num(g) + " g");
				lastGray = g;
			}
			ops.push(num(x) + " " + num(y) + " " + num(w) + " " + num(h) + " re f");
		}

		// opts.phase shifts the dash pattern along the path, to center a dash on a given point
		function dashedLine(x1, y1, x2, y2, opts) {
			var g = opts.gray == null ? 0 : opts.gray;
			var phase = opts.phase || 0;
			ops.push("q [" + num(opts.dash[0]) + " " + num(opts.dash[1]) + "] " + num(phase) + " d " +
				num(opts.width) + " w " + num(g) + " G " +
				num(x1) + " " + num(y1) + " m " + num(x2) + " " + num(y2) + " l S Q");
		}

		// place a JPEG with its bottom-left at (x, y), drawn w x h points
		function image(jpegBytes, imgW, imgH, x, y, w, h) {
			var idx = xobjects.length;
			xobjects.push({ w: imgW, h: imgH, bin: bytesToBinary(jpegBytes) });
			ops.push("q " + num(w) + " 0 0 " + num(h) + " " + num(x) + " " + num(y) +
				" cm /Im" + idx + " Do Q");
		}

		// assemble as a binary string (char codes <= 0xFF) so string offsets are byte offsets
		function end() {
			var stream = ops.join("\n");
			// image XObjects are numbered after the four fixed objects
			var xobjEntries = xobjects.map(function (_, i) {
				return "/Im" + i + " " + (5 + i) + " 0 R";
			}).join(" ");
			var resources = xobjects.length ? "/XObject << " + xobjEntries + " >>" : "";
			var objects = [
				"<< /Type /Catalog /Pages 2 0 R >>",
				"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
				"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + num(widthPt) + " " + num(heightPt) + "]" +
					" /Resources << " + resources + " >> /Contents 4 0 R >>",
				"<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream"
			];
			xobjects.forEach(function (im) {
				objects.push("<< /Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h +
					" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
					im.bin.length + " >>\nstream\n" + im.bin + "\nendstream");
			});
			var out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
			var offsets = [];
			objects.forEach(function (body, i) {
				offsets.push(out.length);
				out += (i + 1) + " 0 obj\n" + body + "\nendobj\n";
			});
			var xref = out.length;
			out += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
			offsets.forEach(function (off) {
				out += ("000000000" + off).slice(-10) + " 00000 n \n";
			});
			out += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\n" +
				"startxref\n" + xref + "\n%%EOF\n";
			var bytes = new Uint8Array(out.length);
			for (var i = 0; i < out.length; i++) { bytes[i] = out.charCodeAt(i); }
			return bytes;
		}

		return { rect: rect, dashedLine: dashedLine, image: image, end: end };
	}

	// "memori · YY·MM·DD·HH·MM·SS.pdf"
	function pdfFilename() {
		var d = new Date();
		var p = function (n) { return String(n).padStart(2, "0"); };
		var ts = [d.getFullYear() % 100, d.getMonth() + 1, d.getDate(),
			d.getHours(), d.getMinutes(), d.getSeconds()].map(p).join("·");
		return "memori · " + ts + ".pdf";
	}

	// back-to-front by stacking order, so overlaps paint like on screen
	function imagesInZOrder() {
		return images.slice().sort(function (a, b) {
			return (parseInt(a.container.style.zIndex, 10) || 0) -
				(parseInt(b.container.style.zIndex, 10) || 0);
		});
	}

	// Rasterize one image at the size of the area it covers on the grid, reproducing
	// updateImagePosition's transform.
	function rasterizeImage(img) {
		var el = img.container.querySelector("img");
		if (!el || !img.naturalWidth || !img.naturalHeight) { return null; }

		var cellPx = CELL_SIZE_MM * PX;
		var cw = Math.round(img.widthCells * cellPx), ch = Math.round(img.heightCells * cellPx);
		var canvas = document.createElement("canvas");
		canvas.width = cw;
		canvas.height = ch;
		var ctx = canvas.getContext("2d");

		// cover-fit scale, recomputed here as the print CSS path does
		var rotated = img.rotation % 180 !== 0;
		var effW = rotated ? img.naturalHeight : img.naturalWidth;
		var effH = rotated ? img.naturalWidth : img.naturalHeight;
		var scale = Math.max(cw / effW, ch / effH) * img.userScale;

		ctx.translate(cw / 2, ch / 2);
		ctx.scale(scale, scale);
		ctx.rotate(img.rotation * Math.PI / 180);
		ctx.translate(img.panX, img.panY);
		ctx.drawImage(el, -img.naturalWidth / 2, -img.naturalHeight / 2, img.naturalWidth, img.naturalHeight);
		return canvas;
	}

	function drawGrid(doc, cellPt, mediaW, mediaH) {
		var perCell = Math.max(1, Math.round(CELL_SIZE_MM / (DASH_MM + GAP_MM)));
		var period = cellPt / perCell;
		var dash = Math.min(DASH_MM * MM, period);
		var half = LINE_PT / 2;
		var opts = { dash: [dash, period - dash], width: LINE_PT, gray: GRID_GRAY, phase: dash / 2 - half };

		for (var c = 0; c <= GRID_COLS; c++) {
			var x = c * cellPt + half;
			doc.dashedLine(x, 0, x, mediaH, opts);
		}
		for (var r = 0; r <= GRID_ROWS; r++) {
			var y = mediaH - (r * cellPt + half); // PDF origin is bottom-left
			doc.dashedLine(0, y, mediaW, y, opts);
		}
	}

	function jpegBytes(canvas) {
		var dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
		var bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
		var bytes = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
		return bytes;
	}

	function buildPdf() {
		var cellPt = CELL_SIZE_MM * MM;
		var mediaW = GRID_COLS * cellPt + LINE_PT;
		var mediaH = GRID_ROWS * cellPt + LINE_PT;
		var doc = createPdf(mediaW, mediaH);

		doc.rect(0, 0, mediaW, mediaH, 1); // white sheet
		drawGrid(doc, cellPt, mediaW, mediaH);

		// photos on top; PDF origin is bottom-left, so flip the cell's y
		imagesInZOrder().forEach(function (img) {
			var canvas = rasterizeImage(img);
			if (!canvas) { return; }
			var x = img.xCell * cellPt;
			var y = mediaH - (img.yCell + img.heightCells) * cellPt;
			doc.image(jpegBytes(canvas), canvas.width, canvas.height,
				x, y, img.widthCells * cellPt, img.heightCells * cellPt);
		});

		return doc.end();
	}

	function exportPdf() {
		var url = URL.createObjectURL(new Blob([buildPdf()], { type: "application/pdf" }));
		var a = document.createElement("a");
		a.href = url;
		a.download = pdfFilename();
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(function () { URL.revokeObjectURL(url); }, 0);
	}

	var printUrl = null;
	function openPdfForPrinting() {
		if (printUrl) { URL.revokeObjectURL(printUrl); }
		printUrl = URL.createObjectURL(new Blob([buildPdf()], { type: "application/pdf" }));
		window.open(printUrl, "_blank");
	}

	window.addEventListener("keydown", function (e) {
		if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) { return; }
		var key = e.key.toLowerCase();
		if (key === "e") {
			e.preventDefault();
			exportPdf();
		} else if (key === "p" && isUsingSafari) {
			// keydown preempts Safari's print dialog (beforeprint can't cancel it)
			e.preventDefault();
			openPdfForPrinting();
		}
	});

	window.addEventListener("pagehide", function () {
		if (printUrl) { URL.revokeObjectURL(printUrl); printUrl = null; }
	});
})();
