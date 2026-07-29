// Image state, the add pipeline, and the transforms that place images on the grid

let images = [];
let dragState = null;
let resizeState = null;
let highestZIndex = 0;
let touchState = null; // For tracking multi-touch gestures
let longPressTimer = null; // For detecting long press to enable pan mode

// Helper function to calculate image dimensions from aspect ratio
function calculateImageDimensions(aspectRatio) {
	let widthCells, heightCells;
	if (aspectRatio >= 1) {
		heightCells = 5;
		widthCells = Math.round(heightCells * aspectRatio);
	} else {
		widthCells = 5;
		heightCells = Math.round(widthCells / aspectRatio);
	}
	return {
		widthCells: Math.min(widthCells, GRID_COLS),
		heightCells: Math.min(heightCells, GRID_ROWS)
	};
}

// Helper function to load an image and get its dimensions
async function loadImageDimensions(file) {
	const reader = new FileReader();
	const dataUrl = await new Promise(resolve => {
		reader.onload = (e) => resolve(e.target.result);
		reader.readAsDataURL(file);
	});

	const img = new Image();
	const dimensions = await new Promise(resolve => {
		img.onload = () => {
			const aspectRatio = img.naturalWidth / img.naturalHeight;
			resolve({
				...calculateImageDimensions(aspectRatio),
				naturalWidth: img.naturalWidth,
				naturalHeight: img.naturalHeight
			});
		};
		img.src = dataUrl;
	});

	return { dataUrl, ...dimensions };
}

// Shared function to process and add images to the grid
async function processAndAddImages(files, dropX = 0, dropY = 0) {
	const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
	if (imageFiles.length === 0) return;

	const cellSize = getCellSize();

	// Load first image to get base dimensions for positioning
	const firstImageData = await loadImageDimensions(imageFiles[0]);

	// Calculate base drop position
	// For single images, center on cursor; for multiple images, place top-left at cursor
	let baseXCell, baseYCell;
	if (imageFiles.length === 1) {
		baseXCell = Math.round(dropX / cellSize.width - firstImageData.widthCells / 2);
		baseYCell = Math.round(dropY / cellSize.height - firstImageData.heightCells / 2);
	} else {
		baseXCell = Math.round(dropX / cellSize.width);
		baseYCell = Math.round(dropY / cellSize.height);
	}

	// Pre-allocate z-indexes to maintain drop order
	const baseZIndex = highestZIndex + 1;
	highestZIndex += imageFiles.length;

	// Load all images
	const imageDataArray = [];
	for (let idx = 0; idx < imageFiles.length; idx++) {
		const data = idx === 0 ? firstImageData : await loadImageDimensions(imageFiles[idx]);
		imageDataArray.push({ idx, ...data });
	}

	// Shift the whole fan back onto the grid before placing anything, so a drop near an edge keeps
	// its diagonal spacing instead of collapsing image by image
	const fanMaxX = Math.max(...imageDataArray.map(({ idx, widthCells }) => baseXCell + idx + widthCells));
	const fanMaxY = Math.max(...imageDataArray.map(({ idx, heightCells }) => baseYCell + idx + heightCells));
	const fanShiftX = Math.max(Math.min(0, GRID_COLS - fanMaxX), -baseXCell);
	const fanShiftY = Math.max(Math.min(0, GRID_ROWS - fanMaxY), -baseYCell);

	let wrappedOffset = 0;
	const placed = [];

	for (const { idx, dataUrl, widthCells, heightCells, naturalWidth, naturalHeight } of imageDataArray) {
		// Calculate position with diagonal offset, kept as close to the drop point as the grid allows
		const maxXCell = GRID_COLS - widthCells;
		const maxYCell = GRID_ROWS - heightCells;
		let xCell = Math.max(0, Math.min(baseXCell + idx + fanShiftX, maxXCell));
		let yCell = Math.max(0, Math.min(baseYCell + idx + fanShiftY, maxYCell));

		// Clamping can pile a multi-image drop onto one cell; cascade those from the top-left instead
		const stacked = placed.some(p => p.xCell === xCell && p.yCell === yCell);
		if (stacked) {
			xCell = Math.min(wrappedOffset, maxXCell);
			yCell = Math.min(wrappedOffset, maxYCell);
			wrappedOffset++;
		}
		placed.push({ xCell, yCell });

		const imageData = addImage(dataUrl, xCell, yCell, widthCells, heightCells, { naturalWidth, naturalHeight });
		imageData.container.style.zIndex = baseZIndex + idx;
	}
}

function addImage(src, xCell, yCell, widthCells, heightCells, initialState) {
	const container = document.createElement('div');
	container.className = 'image-container';
	highestZIndex++;
	container.style.zIndex = highestZIndex;

	const wrapper = document.createElement('div');
	wrapper.className = 'image-wrapper';
	const img = document.createElement('img');
	img.src = src;
	wrapper.appendChild(img);
	container.appendChild(wrapper);

	// Add resize handles
	const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
	handles.forEach(dir => {
		const handle = document.createElement('div');
		handle.className = `resize-handle ${dir.length === 1 ? 'edge' : 'corner'} ${dir}`;
		handle.dataset.direction = dir;
		container.appendChild(handle);
	});

	// Add dimension labels
	const widthLabel = document.createElement('div');
	widthLabel.className = 'dimension-label width';
	widthLabel.textContent = widthCells;
	container.appendChild(widthLabel);

	const heightLabel = document.createElement('div');
	heightLabel.className = 'dimension-label height';
	heightLabel.textContent = heightCells;
	container.appendChild(heightLabel);

	const imageData = {
		container,
		xCell,
		yCell,
		widthCells,
		heightCells,
		// Image positioning within container (in pixels, relative to center)
		panX: 0,
		panY: 0,
		userScale: 1,  // user zoom level (1-5)
		rotation: 0,  // rotation in degrees (0, 90, 180, 270)
		// Store natural image dimensions for calculations
		naturalWidth: 0,
		naturalHeight: 0,
		baseScale: 1,  // scale needed to cover container
		// Known up front when copying an already-loaded image, so the first paint is correct
		...initialState
	};

	// Calculate dimensions and scale once image loads
	img.onload = () => {
		imageData.naturalWidth = img.naturalWidth;
		imageData.naturalHeight = img.naturalHeight;
		updateImagePosition(imageData);
	};
	images.push(imageData);

	updateImagePosition(imageData);
	grid.appendChild(container);

	setupImageHandlers(imageData);

	return imageData;
}

// Rotate one or more images 90° clockwise about the center of their bounding box,
// preserving layout; silently ignored when the turned block can't fit the grid at all
function rotateImages(group) {
	const minX = Math.min(...group.map(img => img.xCell));
	const minY = Math.min(...group.map(img => img.yCell));
	const maxX = Math.max(...group.map(img => img.xCell + img.widthCells));
	const maxY = Math.max(...group.map(img => img.yCell + img.heightCells));
	const width = maxX - minX;
	const height = maxY - minY;

	// Half-cell centers must snap to the grid; rounding away from zero keeps the offset
	// symmetric, so four turns land back where they started
	const offset = Math.sign(width - height) * Math.round(Math.abs(width - height) / 2);
	const left = minX + offset;
	const top = minY - offset;

	const placed = group.map(img => ({
		img,
		xCell: left + height - (img.yCell - minY) - img.heightCells,
		yCell: top + (img.xCell - minX),
		widthCells: img.heightCells,
		heightCells: img.widthCells
	}));

	// The turned block occupies the old box with its dimensions swapped
	if (height > GRID_COLS || width > GRID_ROWS) return;

	// Slide the whole block back on if the turn pushed it past an edge
	const shiftX = left < 0 ? -left : Math.min(0, GRID_COLS - (left + height));
	const shiftY = top < 0 ? -top : Math.min(0, GRID_ROWS - (top + width));

	placed.forEach(p => {
		p.img.xCell = p.xCell + shiftX;
		p.img.yCell = p.yCell + shiftY;
		p.img.widthCells = p.widthCells;
		p.img.heightCells = p.heightCells;
		// Pan stays in the image's original coordinate system - the CSS transform applies
		// rotation before pan, so pan is relative to the rotated image
		p.img.rotation = (p.img.rotation + 90) % 360;
		updateImagePosition(p.img);
	});
}

// Copy an image (and its pan/zoom/rotation) to a new grid position
function duplicateImage(imageData, newXCell, newYCell) {
	const imgElement = imageData.container.querySelector('img');
	const { panX, panY, userScale, rotation, naturalWidth, naturalHeight } = imageData;

	// The source is already loaded, so the copy's crop can be set before it ever paints
	return addImage(
		imgElement.src,
		newXCell,
		newYCell,
		imageData.widthCells,
		imageData.heightCells,
		{ panX, panY, userScale, rotation, naturalWidth, naturalHeight }
	);
}

function deleteImage(imageData) {
	const index = images.indexOf(imageData);
	if (index > -1) images.splice(index, 1);
	selectedImages.delete(imageData);
	imageData.container.remove();
}

function calculatePanBounds(imageData) {
	// Container dimensions in the current (possibly swapped) grid orientation
	const bounds = getPixelPerfectBounds(imageData.xCell, imageData.yCell, imageData.widthCells, imageData.heightCells);
	const containerWidth = bounds.width;
	const containerHeight = bounds.height;

	if (imageData.naturalWidth === 0 || imageData.naturalHeight === 0) {
		return { maxPanX: 0, maxPanY: 0 };
	}

	// Pan coordinates are in the image's original coordinate system (before scale and rotation)
	// So we need to calculate bounds based on the original image dimensions
	const isRotated90or270 = imageData.rotation % 180 !== 0;

	// For pan bounds, we need to match image dimensions to container dimensions
	// in the image's coordinate space (not the screen's coordinate space)
	// When rotated 90/270, panX constrains vertical screen movement (maps to container height)
	// and panY constrains horizontal screen movement (maps to container width)
	const effectiveContainerWidth = isRotated90or270 ? containerHeight : containerWidth;
	const effectiveContainerHeight = isRotated90or270 ? containerWidth : containerHeight;

	// Pan values are in pre-scale image space, but the CSS transform scales them
	// So we need to calculate bounds in pre-scale space
	// The image's natural size minus the container size (in pre-scale space) gives us the overhang
	const totalScale = imageData.baseScale * imageData.userScale;
	const containerWidthInImageSpace = effectiveContainerWidth / totalScale;
	const containerHeightInImageSpace = effectiveContainerHeight / totalScale;

	// Calculate maximum pan in each direction (in pre-scale image space)
	const maxPanX = Math.max(0, (imageData.naturalWidth - containerWidthInImageSpace) / 2);
	const maxPanY = Math.max(0, (imageData.naturalHeight - containerHeightInImageSpace) / 2);

	return { maxPanX, maxPanY };
}

function clampPan(imageData) {
	const { maxPanX, maxPanY } = calculatePanBounds(imageData);
	imageData.panX = Math.max(-maxPanX, Math.min(maxPanX, imageData.panX));
	imageData.panY = Math.max(-maxPanY, Math.min(maxPanY, imageData.panY));
}

// Helper to transform screen-space coordinates to image coordinate space (accounting for rotation)
function rotatePoint(x, y, angleDegrees) {
	const angle = -angleDegrees * Math.PI / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	return {
		x: x * cos - y * sin,
		y: x * sin + y * cos
	};
}

// Helper to apply pan adjustment based on screen delta
function applyPanDelta(imageData, screenDeltaX, screenDeltaY) {
	const rotated = rotatePoint(screenDeltaX, screenDeltaY, imageData.rotation);
	const totalScale = imageData.baseScale * imageData.userScale;
	imageData.panX += rotated.x / totalScale;
	imageData.panY += rotated.y / totalScale;
}

// Helper to calculate zoom-centered pan adjustment
function adjustPanForZoom(imageData, cursorX, cursorY, oldTotalScale, newTotalScale) {
	const rotated = rotatePoint(cursorX, cursorY, imageData.rotation);
	const scaleDiff = 1/newTotalScale - 1/oldTotalScale;
	imageData.panX += rotated.x * scaleDiff;
	imageData.panY += rotated.y * scaleDiff;
}

function updateImagePosition(img) {
	// Use pixel-perfect bounds to prevent subpixel accumulation
	const bounds = getPixelPerfectBounds(img.xCell, img.yCell, img.widthCells, img.heightCells);
	img.container.style.left = bounds.left + 'px';
	img.container.style.top = bounds.top + 'px';
	img.container.style.width = bounds.width + 'px';
	img.container.style.height = bounds.height + 'px';

	// Store cell positions as CSS variables for print styles
	img.container.style.setProperty('--x-cell', img.xCell);
	img.container.style.setProperty('--y-cell', img.yCell);
	img.container.style.setProperty('--width-cells', img.widthCells);
	img.container.style.setProperty('--height-cells', img.heightCells);

	// Update dimension labels
	const widthLabel = img.container.querySelector('.dimension-label.width');
	const heightLabel = img.container.querySelector('.dimension-label.height');
	if (widthLabel) {
		// Only update text if dimension is >= 5
		if (img.widthCells >= 5) {
			widthLabel.textContent = img.widthCells;
		}
		widthLabel.dataset.hidden = img.widthCells < 5 ? 'true' : 'false';
	}
	if (heightLabel) {
		// Only update text if dimension is >= 5
		if (img.heightCells >= 5) {
			heightLabel.textContent = img.heightCells;
		}
		heightLabel.dataset.hidden = img.heightCells < 5 ? 'true' : 'false';
	}

	// Recalculate baseScale if container size changed
	if (img.naturalWidth > 0 && img.naturalHeight > 0) {
		// Use pixel-perfect bounds for container dimensions
		const containerWidth = bounds.width;
		const containerHeight = bounds.height;

		// When rotated 90° or 270°, the image dimensions are effectively swapped
		const isRotated90or270 = img.rotation % 180 !== 0;
		const effectiveWidth = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
		const effectiveHeight = isRotated90or270 ? img.naturalWidth : img.naturalHeight;

		const scaleX = containerWidth / effectiveWidth;
		const scaleY = containerHeight / effectiveHeight;
		img.baseScale = Math.max(scaleX, scaleY);

		// Reclamp pan after recalculating base scale
		clampPan(img);
	}

	// Apply image positioning and scale using transform
	const imgElement = img.container.querySelector('img');
	if (imgElement) {
		const totalScale = img.baseScale * img.userScale;
		// Transform: translate from center (-50%, -50%), scale, rotate, then pan
		// Pan is applied after rotation so it stays relative to the image's rotated state
		imgElement.style.transform = `translate(-50%, -50%) scale(${totalScale}) rotate(${img.rotation}deg) translate(${img.panX}px, ${img.panY}px)`;
	}
}

function bringToFront(container) {
	highestZIndex++;
	container.style.zIndex = highestZIndex;
}
