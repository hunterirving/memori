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
			const aspectRatio = img.width / img.height;
			resolve(calculateImageDimensions(aspectRatio));
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

	let wrappedOffset = 0;

	for (const { idx, dataUrl, widthCells, heightCells } of imageDataArray) {
		// Calculate position with diagonal offset
		let xCell = baseXCell + idx;
		let yCell = baseYCell + idx;

		// If out of bounds or would overlap with wrapped images, wrap to next diagonal position
		const outOfBounds = xCell < 0 || yCell < 0 ||
		                    xCell + widthCells > GRID_COLS ||
		                    yCell + heightCells > GRID_ROWS;
		const overlapsWrapped = xCell < wrappedOffset || yCell < wrappedOffset;

		if (outOfBounds || overlapsWrapped) {
			xCell = wrappedOffset;
			yCell = wrappedOffset;
			wrappedOffset++;
		}

		const imageData = addImage(dataUrl, xCell, yCell, widthCells, heightCells);
		imageData.container.style.zIndex = baseZIndex + idx;
	}
}

// Prevent default drag behavior on entire document
document.addEventListener('dragover', (e) => {
	e.preventDefault();
	e.stopPropagation();
});

document.addEventListener('drop', async (e) => {
	e.preventDefault();
	e.stopPropagation();

	// Get drop position relative to the grid
	const gridRect = grid.getBoundingClientRect();
	const dropX = e.clientX - gridRect.left;
	const dropY = e.clientY - gridRect.top;

	await processAndAddImages(e.dataTransfer.files, dropX, dropY);
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

	// Unified pointer start handler
	function handlePointerStart(clientX, clientY, isTouch = false) {
		// Clear any existing timers from other images
		clearDragState();

		// Lock cursor to move during drag operation
		document.body.style.cursor = 'move';
		document.body.classList.add('dragging');

		dragState = {
			image: imageData,
			startX: clientX,
			startY: clientY,
			startXCell: imageData.xCell,
			startYCell: imageData.yCell,
			isPanMode: false, // Will be set to true after long press
			isTouch: isTouch
		};

		container.classList.add('dragging');

		// For touch, set up long press timer to enable pan mode
		if (isTouch) {
			longPressTimer = setTimeout(() => {
				if (dragState && dragState.image === imageData &&
				    dragState.startXCell === imageData.xCell &&
				    dragState.startYCell === imageData.yCell) {
					// User held for 0.5 seconds without moving to a new cell - enable pan mode
					dragState.isPanMode = true;
					dragState.initialPanX = imageData.panX;
					dragState.initialPanY = imageData.panY;
					// Add visual feedback class
					container.classList.add('pan-mode');
				}
			}, 500);
		}
	}

	// Touch event handlers for mobile
	container.addEventListener('touchstart', (e) => {
		if (e.target.classList.contains('resize-handle')) return;

		// Bring to front on touch
		bringToFront(container);

		if (e.touches.length === 1) {
			// Single touch - start drag (or long press for pan)
			e.preventDefault();
			const touch = e.touches[0];
			handlePointerStart(touch.clientX, touch.clientY, true);
		} else if (e.touches.length === 2) {
			// Two fingers - prepare for pinch/pan
			e.preventDefault();

			// Cancel any ongoing drag
			clearDragState();

			const touch1 = e.touches[0];
			const touch2 = e.touches[1];

			// Calculate initial distance for pinch detection
			const dx = touch2.clientX - touch1.clientX;
			const dy = touch2.clientY - touch1.clientY;
			const distance = Math.sqrt(dx * dx + dy * dy);

			// Calculate center point
			const centerX = (touch1.clientX + touch2.clientX) / 2;
			const centerY = (touch1.clientY + touch2.clientY) / 2;

			touchState = {
				image: imageData,
				initialDistance: distance,
				lastDistance: distance,
				initialScale: imageData.userScale,
				lastCenterX: centerX,
				lastCenterY: centerY,
				lastPanX: imageData.panX,
				lastPanY: imageData.panY
			};
		}
	}, { passive: false });

	container.addEventListener('touchmove', (e) => {
		if (e.touches.length === 2 && touchState && touchState.image === imageData) {
			// Two finger pinch/pan
			e.preventDefault();

			const touch1 = e.touches[0];
			const touch2 = e.touches[1];

			// Calculate current distance
			const dx = touch2.clientX - touch1.clientX;
			const dy = touch2.clientY - touch1.clientY;
			const distance = Math.sqrt(dx * dx + dy * dy);

			// Calculate center point
			const centerX = (touch1.clientX + touch2.clientX) / 2;
			const centerY = (touch1.clientY + touch2.clientY) / 2;

			// Detect if this is primarily a pinch or a pan
			const distanceChange = Math.abs(distance - touchState.lastDistance);
			const centerMoveX = centerX - touchState.lastCenterX;
			const centerMoveY = centerY - touchState.lastCenterY;
			const centerMovement = Math.sqrt(centerMoveX * centerMoveX + centerMoveY * centerMoveY);

			// If distance changed significantly more than center moved, treat as pinch
			if (distanceChange > centerMovement * 0.5) {
				// Pinch zoom
				const rect = container.getBoundingClientRect();
				const cursorX = centerX - rect.left - rect.width / 2;
				const cursorY = centerY - rect.top - rect.height / 2;

				const oldUserScale = imageData.userScale;
				const oldTotalScale = imageData.baseScale * oldUserScale;
				const scaleFactor = distance / touchState.initialDistance;
				const newUserScale = Math.max(1, Math.min(5, touchState.initialScale * scaleFactor));
				const newTotalScale = imageData.baseScale * newUserScale;

				// Restore previous pan state and apply zoom adjustment
				imageData.panX = touchState.lastPanX;
				imageData.panY = touchState.lastPanY;
				adjustPanForZoom(imageData, cursorX, cursorY, oldTotalScale, newTotalScale);
				imageData.userScale = newUserScale;

				clampPan(imageData);
				touchState.lastPanX = imageData.panX;
				touchState.lastPanY = imageData.panY;
			} else {
				// Two-finger pan
				imageData.panX = touchState.lastPanX;
				imageData.panY = touchState.lastPanY;
				applyPanDelta(imageData, centerMoveX, centerMoveY);

				clampPan(imageData);
				touchState.lastPanX = imageData.panX;
				touchState.lastPanY = imageData.panY;
			}

			touchState.lastDistance = distance;
			touchState.lastCenterX = centerX;
			touchState.lastCenterY = centerY;

			updateImagePosition(imageData);
		}
	}, { passive: false });

	container.addEventListener('touchend', () => {
		if (touchState && touchState.image === imageData) {
			touchState = null;
		}
	}, { passive: false });

	container.addEventListener('touchcancel', () => {
		if (touchState && touchState.image === imageData) {
			touchState = null;
		}
	}, { passive: false });

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
			// Calculate target position (1 cell right and 1 cell down)
			let newXCell = imageData.xCell + 1;
			let newYCell = imageData.yCell + 1;

			// If there's not enough room, fall back to top-left
			if (newXCell + imageData.widthCells > GRID_COLS || newYCell + imageData.heightCells > GRID_ROWS) {
				newXCell = 0;
				newYCell = 0;
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

		handlePointerStart(e.clientX, e.clientY);
	});

	// Resizing - unified handler for mouse and touch
	function startResize(clientX, clientY, direction, cursorStyle = null) {
		if (cursorStyle) {
			document.body.style.cursor = cursorStyle;
		}
		document.body.classList.add('resizing');

		resizeState = {
			image: imageData,
			direction: direction,
			startX: clientX,
			startY: clientY,
			startXCell: imageData.xCell,
			startYCell: imageData.yCell,
			startWidthCells: imageData.widthCells,
			startHeightCells: imageData.heightCells
		};
		container.classList.add('resizing');
	}

	container.querySelectorAll('.resize-handle').forEach(handle => {
		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const cursorStyle = window.getComputedStyle(handle).cursor;
			startResize(e.clientX, e.clientY, handle.dataset.direction, cursorStyle);
		});

		handle.addEventListener('touchstart', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const touch = e.touches[0];
			startResize(touch.clientX, touch.clientY, handle.dataset.direction);
		}, { passive: false });
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
			const cursorX = e.clientX - rect.left - rect.width / 2;
			const cursorY = e.clientY - rect.top - rect.height / 2;

			const oldUserScale = imageData.userScale;
			const oldTotalScale = imageData.baseScale * oldUserScale;
			const zoomDelta = -e.deltaY * 0.01;
			const newUserScale = Math.max(1, Math.min(5, oldUserScale * (1 + zoomDelta)));
			const newTotalScale = imageData.baseScale * newUserScale;

			adjustPanForZoom(imageData, cursorX, cursorY, oldTotalScale, newTotalScale);
			imageData.userScale = newUserScale;

			clampPan(imageData);
		} else {
			// Pan (two-finger scroll on macOS trackpad)
			applyPanDelta(imageData, -e.deltaX, -e.deltaY);
			clampPan(imageData);
		}

		updateImagePosition(imageData);
	}, { passive: false });
}

// Helper to clear drag state and timers
function clearDragState() {
	if (longPressTimer) {
		clearTimeout(longPressTimer);
		longPressTimer = null;
	}
	if (dragState) {
		dragState.image.container.classList.remove('dragging');
		dragState.image.container.classList.remove('pan-mode');
		dragState = null;
		document.body.style.cursor = '';
		document.body.classList.remove('dragging');
	}
}

function handleMove(clientX, clientY) {
	if (dragState) {
		const dx = clientX - dragState.startX;
		const dy = clientY - dragState.startY;

		if (dragState.isPanMode) {
			// Pan mode - move the image within its container
			const imageData = dragState.image;
			imageData.panX = dragState.initialPanX;
			imageData.panY = dragState.initialPanY;
			applyPanDelta(imageData, dx, dy);
			clampPan(imageData);
			updateImagePosition(imageData);
		} else {
			// Normal drag mode - move the image container on the grid
			const cellSize = getCellSize();
			const dxCells = Math.round(dx / cellSize.width);
			const dyCells = Math.round(dy / cellSize.height);

			const newXCell = Math.max(0, Math.min(GRID_COLS - dragState.image.widthCells, dragState.startXCell + dxCells));
			const newYCell = Math.max(0, Math.min(GRID_ROWS - dragState.image.heightCells, dragState.startYCell + dyCells));

			// If the image moved to a new cell, cancel the long press timer
			if (dragState.isTouch && longPressTimer &&
			    (newXCell !== dragState.startXCell || newYCell !== dragState.startYCell)) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}

			dragState.image.xCell = newXCell;
			dragState.image.yCell = newYCell;
			updateImagePosition(dragState.image);
		}
	}

	if (resizeState) {
		const dx = clientX - resizeState.startX;
		const dy = clientY - resizeState.startY;

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
}

function handleEnd() {
	clearDragState();
	if (resizeState) {
		resizeState.image.container.classList.remove('resizing');
		resizeState = null;
		document.body.style.cursor = '';
		document.body.classList.remove('resizing');
	}
}

document.addEventListener('mousemove', (e) => {
	handleMove(e.clientX, e.clientY);
});

document.addEventListener('mouseup', () => {
	handleEnd();
});

document.addEventListener('touchmove', (e) => {
	// Only handle global drag/resize, not image-specific multi-touch
	if ((dragState || resizeState) && e.touches.length === 1) {
		e.preventDefault();
		const touch = e.touches[0];
		handleMove(touch.clientX, touch.clientY);
	}
}, { passive: false });

document.addEventListener('touchend', () => {
	handleEnd();
});

document.addEventListener('touchcancel', () => {
	handleEnd();
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
	// Wait for layout to settle after exiting print mode
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			images.forEach(img => updateImagePosition(img));
		});
	});
});

// Theme system
let currentThemeIndex = 0;
let isF2Pressed = false;
const themes = ['sea-breeze', 'grape-soda', 'coral', 'guac', 'mojito', 'toast'];

function setTheme(theme) {
	document.documentElement.setAttribute('data-theme', theme);
	const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--desk').trim();
	document.querySelector('meta[name="theme-color"]').setAttribute('content', backgroundColor);
}

function cycleTheme() {
	currentThemeIndex = (currentThemeIndex + 1) % themes.length;
	const newTheme = themes[currentThemeIndex];
	setTheme(newTheme);
	saveThemeToLocalStorage(newTheme);
}

function saveThemeToLocalStorage(theme) {
	localStorage.setItem('memori-theme', theme);
}

function loadThemeFromLocalStorage() {
	const savedTheme = localStorage.getItem('memori-theme');
	if (savedTheme && themes.includes(savedTheme)) {
		currentThemeIndex = themes.indexOf(savedTheme);
		setTheme(savedTheme);
	} else {
		// Use default theme
		setTheme(themes[0]);
	}
}

// F2 key handler for theme cycling
document.addEventListener('keydown', (e) => {
	if (e.key === 'F2' && !isF2Pressed) {
		e.preventDefault();
		isF2Pressed = true;
		cycleTheme();
	}
});

document.addEventListener('keyup', (e) => {
	if (e.key === 'F2') {
		isF2Pressed = false;
	}
});

// Load theme on page load
loadThemeFromLocalStorage();

// Warn before leaving page if images are present
window.addEventListener('beforeunload', (e) => {
	if (images.length > 0) {
		e.preventDefault();
		e.returnValue = '';
		return '';
	}
});

// Mobile file input handling
const fileInput = document.getElementById('fileInput');
const addImagesBtn = document.getElementById('addImagesBtn');

addImagesBtn.addEventListener('click', () => {
	fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
	await processAndAddImages(e.target.files, 0, 0);

	// Clear the input so the same files can be selected again
	fileInput.value = '';
});
