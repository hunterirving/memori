const GRID_COLS = 50;
const GRID_ROWS = 66;

const grid = document.getElementById('grid');
const page = document.querySelector('.page');

// Calculate cell size dynamically based on actual grid dimensions
function getCellSize() {
	const gridRect = grid.getBoundingClientRect();
	return {
		width: gridRect.width / GRID_COLS,
		height: gridRect.height / GRID_ROWS
	};
}

// Create grid cells
for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
	const cell = document.createElement('div');
	cell.className = 'grid-cell';
	grid.appendChild(cell);
}

let images = [];
let dragState = null;
let resizeState = null;
let highestZIndex = 0;

// Prevent default drag behavior on entire document
document.addEventListener('dragover', (e) => {
	e.preventDefault();
	e.stopPropagation();
});

document.addEventListener('drop', async (e) => {
	e.preventDefault();
	e.stopPropagation();

	const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
	if (files.length === 0) return;

	// Get drop position relative to the grid
	const gridRect = grid.getBoundingClientRect();
	const cellSize = getCellSize();

	// Clamp drop position to grid boundaries
	let dropX = e.clientX - gridRect.left;
	let dropY = e.clientY - gridRect.top;
	dropX = Math.max(0, Math.min(gridRect.width, dropX));
	dropY = Math.max(0, Math.min(gridRect.height, dropY));

	// Load first image to get base dimensions
	let firstImageDimensions = null;
	if (files.length > 0) {
		const firstFile = files[0];
		const reader = new FileReader();
		const dataUrl = await new Promise(resolve => {
			reader.onload = (e) => resolve(e.target.result);
			reader.readAsDataURL(firstFile);
		});

		const img = new Image();
		await new Promise(resolve => {
			img.onload = () => {
				const aspectRatio = img.width / img.height;
				let widthCells, heightCells;
				if (aspectRatio >= 1) {
					heightCells = 5;
					widthCells = Math.round(heightCells * aspectRatio);
				} else {
					widthCells = 5;
					heightCells = Math.round(widthCells / aspectRatio);
				}
				widthCells = Math.min(widthCells, GRID_COLS);
				heightCells = Math.min(heightCells, GRID_ROWS);
				firstImageDimensions = { widthCells, heightCells };
				resolve();
			};
			img.src = dataUrl;
		});
	}

	// Now process all files
	files.forEach((file, idx) => {
		const reader = new FileReader();
		reader.onload = (event) => {
			const img = new Image();
			img.onload = () => {
				const aspectRatio = img.width / img.height;

				// Set smaller dimension to 5 cells, calculate larger dimension
				let widthCells, heightCells;
				if (aspectRatio >= 1) {
					// Width is larger or equal
					heightCells = 5;
					widthCells = Math.round(heightCells * aspectRatio);
				} else {
					// Height is larger
					widthCells = 5;
					heightCells = Math.round(widthCells / aspectRatio);
				}

				// Clamp to grid boundaries
				widthCells = Math.min(widthCells, GRID_COLS);
				heightCells = Math.min(heightCells, GRID_ROWS);

				// Calculate position with first image's center under drop point
				let xCell = Math.round(dropX / cellSize.width - firstImageDimensions.widthCells / 2) + (idx * 2);
				let yCell = Math.round(dropY / cellSize.height - firstImageDimensions.heightCells / 2);

				// Ensure image stays within grid bounds
				xCell = Math.max(0, Math.min(GRID_COLS - widthCells, xCell));
				yCell = Math.max(0, Math.min(GRID_ROWS - heightCells, yCell));

				addImage(event.target.result, xCell, yCell, widthCells, heightCells);
			};
			img.src = event.target.result;
		};
		reader.readAsDataURL(file);
	});
});

function addImage(src, xCell, yCell, widthCells, heightCells) {
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
		baseScale: 1  // scale needed to cover container
	};

	// Calculate dimensions and scale once image loads
	img.onload = () => {
		imageData.naturalWidth = img.naturalWidth;
		imageData.naturalHeight = img.naturalHeight;

		// Calculate base scale to cover container (mimics object-fit: cover)
		const cellSize = getCellSize();
		const containerWidth = imageData.widthCells * cellSize.width;
		const containerHeight = imageData.heightCells * cellSize.height;
		const scaleX = containerWidth / img.naturalWidth;
		const scaleY = containerHeight / img.naturalHeight;
		imageData.baseScale = Math.max(scaleX, scaleY);

		updateImagePosition(imageData);
	};
	images.push(imageData);

	updateImagePosition(imageData);
	grid.appendChild(container);

	setupImageHandlers(imageData);

	return imageData;
}

function calculatePanBounds(imageData) {
	// Container dimensions in the current (possibly swapped) grid orientation
	const cellSize = getCellSize();
	const containerWidth = imageData.widthCells * cellSize.width;
	const containerHeight = imageData.heightCells * cellSize.height;

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

function updateImagePosition(img) {
	const cellSize = getCellSize();
	img.container.style.left = img.xCell * cellSize.width + 'px';
	img.container.style.top = img.yCell * cellSize.height + 'px';
	img.container.style.width = img.widthCells * cellSize.width + 'px';
	img.container.style.height = img.heightCells * cellSize.height + 'px';

	// Store cell positions as CSS variables for print styles
	img.container.style.setProperty('--x-cell', img.xCell);
	img.container.style.setProperty('--y-cell', img.yCell);
	img.container.style.setProperty('--width-cells', img.widthCells);
	img.container.style.setProperty('--height-cells', img.heightCells);

	// Update dimension labels
	const widthLabel = img.container.querySelector('.dimension-label.width');
	const heightLabel = img.container.querySelector('.dimension-label.height');
	if (widthLabel) widthLabel.textContent = img.widthCells;
	if (heightLabel) heightLabel.textContent = img.heightCells;

	// Recalculate baseScale if container size changed
	if (img.naturalWidth > 0 && img.naturalHeight > 0) {
		const containerWidth = img.widthCells * cellSize.width;
		const containerHeight = img.heightCells * cellSize.height;

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

function setupImageHandlers(imageData) {
	const container = imageData.container;

	// Bring to front on hover
	container.addEventListener('mouseenter', () => {
		bringToFront(container);
	});

	// Moving / Deleting / Duplicating
	container.addEventListener('mousedown', (e) => {
		if (e.target.classList.contains('resize-handle')) return;

		e.preventDefault();

		// Shift-click to delete
		if (e.shiftKey) {
			const index = images.indexOf(imageData);
			if (index > -1) {
				images.splice(index, 1);
			}
			container.remove();
			return;
		}

		// Option-click (or Alt-click on Windows/Linux) to rotate
		if (e.altKey) {
			// Check if rotation would cause dimension swap and if it would fit on grid
			const oldRotation = imageData.rotation;
			const newRotation = (imageData.rotation + 90) % 360;

			// When rotating between portrait and landscape (90° or 270°), dimensions swap
			const willSwapDimensions = (oldRotation % 180 === 0 && newRotation % 180 !== 0) ||
			                           (oldRotation % 180 !== 0 && newRotation % 180 === 0);

			if (willSwapDimensions) {
				// Check if swapped dimensions would fit on grid at current position
				const newWidthCells = imageData.heightCells;
				const newHeightCells = imageData.widthCells;

				// Don't allow rotation if it would exceed grid bounds
				if (imageData.xCell + newWidthCells > GRID_COLS ||
				    imageData.yCell + newHeightCells > GRID_ROWS) {
					return; // Silently ignore the rotation
				}

				// Swap width and height
				imageData.widthCells = newWidthCells;
				imageData.heightCells = newHeightCells;
			}

			// Rotate 90 degrees clockwise
			imageData.rotation = newRotation;

			// Don't rotate pan coordinates - they stay in the image's original coordinate system
			// The CSS transform applies rotation before pan, so pan is relative to the rotated image

			updateImagePosition(imageData);
			return;
		}

		// Cmd-click (or Ctrl-click on Windows/Linux) to duplicate
		if (e.metaKey || e.ctrlKey) {
			// Calculate target position (2 cells to the right if there's room)
			let newXCell = imageData.xCell + 2;
			let newYCell = imageData.yCell;

			// If there's not enough room to the right, try to place appropriately
			if (newXCell + imageData.widthCells > GRID_COLS) {
				// Try wrapping to next row
				newXCell = 0;
				newYCell = imageData.yCell + imageData.heightCells;

				// If that goes off the bottom, place at origin
				if (newYCell + imageData.heightCells > GRID_ROWS) {
					newXCell = 0;
					newYCell = 0;
				}
			}

			// Create duplicate with the same image source and dimensions
			const imgElement = container.querySelector('img');
			const newImageData = addImage(
				imgElement.src,
				newXCell,
				newYCell,
				imageData.widthCells,
				imageData.heightCells
			);

			// Copy pan, zoom, and rotation settings from original
			// Store the original settings to apply after image loads
			const originalPanX = imageData.panX;
			const originalPanY = imageData.panY;
			const originalUserScale = imageData.userScale;
			const originalRotation = imageData.rotation;

			// Override the onload to copy settings
			const newImg = newImageData.container.querySelector('img');
			const originalOnload = newImg.onload;
			newImg.onload = () => {
				// Run the original onload first
				if (originalOnload) originalOnload.call(newImg);

				// Then apply the copied settings
				newImageData.panX = originalPanX;
				newImageData.panY = originalPanY;
				newImageData.userScale = originalUserScale;
				newImageData.rotation = originalRotation;
				updateImagePosition(newImageData);
			};

			// If image is already loaded (cached), trigger the settings copy
			if (newImg.complete && newImageData.naturalWidth > 0) {
				newImageData.panX = originalPanX;
				newImageData.panY = originalPanY;
				newImageData.userScale = originalUserScale;
				newImageData.rotation = originalRotation;
				updateImagePosition(newImageData);
			}

			return;
		}

		// Lock cursor to move during drag operation
		document.body.style.cursor = 'move';
		document.body.classList.add('dragging');

		dragState = {
			image: imageData,
			startX: e.clientX,
			startY: e.clientY,
			startXCell: imageData.xCell,
			startYCell: imageData.yCell
		};
		container.classList.add('dragging');
	});

	// Resizing
	container.querySelectorAll('.resize-handle').forEach(handle => {
		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();

			// Get the cursor style from the handle and apply it to the body
			const cursorStyle = window.getComputedStyle(handle).cursor;
			document.body.style.cursor = cursorStyle;
			document.body.classList.add('resizing');

			resizeState = {
				image: imageData,
				direction: handle.dataset.direction,
				startX: e.clientX,
				startY: e.clientY,
				startXCell: imageData.xCell,
				startYCell: imageData.yCell,
				startWidthCells: imageData.widthCells,
				startHeightCells: imageData.heightCells
			};
			container.classList.add('resizing');
		});
	});

	// Pan and Zoom with wheel events (macOS trackpad gestures)
	container.addEventListener('wheel', (e) => {
		// Don't interfere with dragging or resizing
		if (dragState || resizeState) return;

		e.preventDefault();
		e.stopPropagation();

		// Detect pinch zoom (ctrlKey is set for pinch gestures on macOS trackpad)
		if (e.ctrlKey) {
			// Zoom at cursor position
			const rect = container.getBoundingClientRect();
			const cursorX = e.clientX - rect.left - rect.width / 2; // Screen pixels from center
			const cursorY = e.clientY - rect.top - rect.height / 2; // Screen pixels from center

			const oldUserScale = imageData.userScale;
			const oldTotalScale = imageData.baseScale * oldUserScale;
			const zoomDelta = -e.deltaY * 0.01;
			const newUserScale = Math.max(1, Math.min(5, oldUserScale * (1 + zoomDelta)));
			const newTotalScale = imageData.baseScale * newUserScale;

			// Transform cursor position to account for rotation
			// The CSS transform applies rotation before pan, so we need to rotate the cursor position
			// into the image's coordinate system (inverse rotation)
			const angle = -imageData.rotation * Math.PI / 180; // Negative for inverse rotation
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			const rotatedCursorX = cursorX * cos - cursorY * sin;
			const rotatedCursorY = cursorX * sin + cursorY * cos;

			// The point under the cursor in pre-scale image space is:
			// imagePoint = (cursorScreen / oldTotalScale) - panX
			// We want: (imagePoint + newPanX) * newTotalScale = cursorScreen
			// So: newPanX = (cursorScreen / newTotalScale) - imagePoint
			//            = (cursorScreen / newTotalScale) - (cursorScreen / oldTotalScale - panX)
			//            = cursorScreen * (1/newTotalScale - 1/oldTotalScale) + panX
			imageData.panX = rotatedCursorX * (1/newTotalScale - 1/oldTotalScale) + imageData.panX;
			imageData.panY = rotatedCursorY * (1/newTotalScale - 1/oldTotalScale) + imageData.panY;
			imageData.userScale = newUserScale;

			// Clamp after zooming to prevent whitespace
			clampPan(imageData);
		} else {
			// Pan (two-finger scroll on macOS trackpad)
			// Transform deltas to account for image rotation
			const angle = -imageData.rotation * Math.PI / 180; // Negative because we want screen-to-image transform
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);

			// Rotate the delta vector by the negative of the image rotation
			const rotatedDeltaX = e.deltaX * cos - e.deltaY * sin;
			const rotatedDeltaY = e.deltaX * sin + e.deltaY * cos;

			// Convert screen-space delta to pre-scale image space
			const totalScale = imageData.baseScale * imageData.userScale;
			imageData.panX -= rotatedDeltaX / totalScale;
			imageData.panY -= rotatedDeltaY / totalScale;

			// Clamp pan to prevent whitespace
			clampPan(imageData);
		}

		updateImagePosition(imageData);
	}, { passive: false });
}

document.addEventListener('mousemove', (e) => {
	if (dragState) {
		const dx = e.clientX - dragState.startX;
		const dy = e.clientY - dragState.startY;

		const cellSize = getCellSize();
		const dxCells = Math.round(dx / cellSize.width);
		const dyCells = Math.round(dy / cellSize.height);

		const newXCell = Math.max(0, Math.min(GRID_COLS - dragState.image.widthCells, dragState.startXCell + dxCells));
		const newYCell = Math.max(0, Math.min(GRID_ROWS - dragState.image.heightCells, dragState.startYCell + dyCells));

		dragState.image.xCell = newXCell;
		dragState.image.yCell = newYCell;
		updateImagePosition(dragState.image);
	}

	if (resizeState) {
		const dx = e.clientX - resizeState.startX;
		const dy = e.clientY - resizeState.startY;

		const cellSize = getCellSize();
		const dxCells = Math.round(dx / cellSize.width);
		const dyCells = Math.round(dy / cellSize.height);

		const dir = resizeState.direction;
		const img = resizeState.image;

		let newX = img.xCell;
		let newY = img.yCell;
		let newW = img.widthCells;
		let newH = img.heightCells;

		if (dir.includes('e')) {
			const proposedW = Math.max(1, resizeState.startWidthCells + dxCells);
			// Clamp to grid boundary
			newW = Math.min(proposedW, GRID_COLS - resizeState.startXCell);
		}
		if (dir.includes('w')) {
			const delta = Math.min(dxCells, resizeState.startWidthCells - 1);
			const proposedX = resizeState.startXCell + delta;
			// Clamp to grid boundary
			const clampedX = Math.max(0, proposedX);
			newX = clampedX;
			newW = resizeState.startWidthCells - (clampedX - resizeState.startXCell);
		}
		if (dir.includes('s')) {
			const proposedH = Math.max(1, resizeState.startHeightCells + dyCells);
			// Clamp to grid boundary
			newH = Math.min(proposedH, GRID_ROWS - resizeState.startYCell);
		}
		if (dir.includes('n')) {
			const delta = Math.min(dyCells, resizeState.startHeightCells - 1);
			const proposedY = resizeState.startYCell + delta;
			// Clamp to grid boundary
			const clampedY = Math.max(0, proposedY);
			newY = clampedY;
			newH = resizeState.startHeightCells - (clampedY - resizeState.startYCell);
		}

		img.xCell = newX;
		img.yCell = newY;
		img.widthCells = newW;
		img.heightCells = newH;
		updateImagePosition(img);
	}
});

document.addEventListener('mouseup', () => {
	if (dragState) {
		dragState.image.container.classList.remove('dragging');
		dragState = null;
		// Restore the default cursor
		document.body.style.cursor = '';
		document.body.classList.remove('dragging');
	}
	if (resizeState) {
		resizeState.image.container.classList.remove('resizing');
		resizeState = null;
		// Restore the default cursor
		document.body.style.cursor = '';
		document.body.classList.remove('resizing');
	}
});

// Update all image positions when window resizes (for responsive scaling)
window.addEventListener('resize', () => {
	images.forEach(img => {
		updateImagePosition(img);
	});
});

// Adjust image scales for print and restore after
const PRINT_CELL_SIZE_PX = 4 * 96 / 25.4; // 4mm in pixels at 96 DPI

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
	// Just recalculate everything based on current screen size
	images.forEach(img => updateImagePosition(img));
});
