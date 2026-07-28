// Rescale images against the mm-sized print cell on beforeprint, restore screen scale on afterprint

const PRINT_CELL_SIZE_PX = CELL_SIZE_MM * 96 / 25.4; // Cell size in pixels at 96 DPI

window.addEventListener('beforeprint', () => {
	images.forEach(img => {
		const imgElement = img.container.querySelector('img');
		if (!imgElement || !img.naturalWidth || !img.naturalHeight) return;

		// Calculate print container size
		const printWidth = img.widthCells * PRINT_CELL_SIZE_PX;
		const printHeight = img.heightCells * PRINT_CELL_SIZE_PX;

		// Recalculate base scale for print
		const isRotated = img.rotation % 180 !== 0;
		const effectiveW = isRotated ? img.naturalHeight : img.naturalWidth;
		const effectiveH = isRotated ? img.naturalWidth : img.naturalHeight;
		const printBaseScale = Math.max(printWidth / effectiveW, printHeight / effectiveH);

		// Apply print transform
		const printScale = printBaseScale * img.userScale;
		imgElement.style.transform = `translate(-50%, -50%) scale(${printScale}) rotate(${img.rotation}deg) translate(${img.panX}px, ${img.panY}px)`;
	});
});

window.addEventListener('afterprint', () => {
	// Wait for layout to settle after exiting print mode
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			images.forEach(img => updateImagePosition(img));
		});
	});
});
