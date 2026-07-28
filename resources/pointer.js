// Per-image mouse, touch, and wheel handling: move, resize, rotate, pan, zoom

function setupImageHandlers(imageData) {
	const container = imageData.container;

	// Bring to front on hover
	container.addEventListener('mouseenter', () => {
		bringToFront(container);
	});

	// Unified pointer start handler
	function handlePointerStart(clientX, clientY, isTouch = false, touchIdentifier = null) {
		// Clear any existing timers from other images
		clearDragState();

		document.body.style.cursor = 'grabbing';
		document.body.classList.add('dragging');

		dragState = {
			image: imageData,
			startX: clientX,
			startY: clientY,
			startXCell: imageData.xCell,
			startYCell: imageData.yCell,
			isPanMode: false, // Will be set to true after long press
			isTouch: isTouch,
			timerId: null, // Store timer ID to ensure we only activate the correct timer
			touchIdentifier: touchIdentifier, // Track which touch this drag belongs to
			hasMoved: false // Track if any movement has occurred
		};

		container.classList.add('dragging');

		// For touch, set up long press timer to enable pan mode
		if (isTouch) {
			const timerId = setTimeout(() => {
				// Only activate pan mode if:
				// 1. This drag state is still active
				// 2. This drag state is for this specific image
				// 3. The image hasn't moved to a new cell
				// 4. This is the timer that was created for this drag state
				if (dragState &&
				    dragState.image === imageData &&
				    dragState.startXCell === imageData.xCell &&
				    dragState.startYCell === imageData.yCell &&
				    dragState.timerId === timerId) {
					// User held for 0.5 seconds without moving to a new cell - enable pan mode
					dragState.isPanMode = true;
					dragState.initialPanX = imageData.panX;
					dragState.initialPanY = imageData.panY;
					// Add visual feedback class
					container.classList.add('pan-mode');
				}
			}, 500);
			dragState.timerId = timerId;
			longPressTimer = timerId;
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
			handlePointerStart(touch.clientX, touch.clientY, true, touch.identifier);
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
		e.preventDefault();
		e.stopPropagation();

		// Don't interfere with dragging or resizing
		if (dragState || resizeState) return;

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

		// Safari on iOS can send the first touchmove with stale coordinates when zoomed
		// Validate that the first move is reasonable by checking if it would move more than 1 cell
		if (dragState.isTouch && !dragState.hasMoved) {
			const cellSize = getCellSize();
			const dxCells = Math.abs(Math.round(dx / cellSize.width));
			const dyCells = Math.abs(Math.round(dy / cellSize.height));

			// If the first move would jump more than 1 cell in either direction,
			// it's likely stale coordinates from a previous tap - reset start position
			if (dxCells > 1 || dyCells > 1) {
				dragState.startX = clientX;
				dragState.startY = clientY;
				dragState.hasMoved = true;
				return; // Don't process this move event
			}
			dragState.hasMoved = true;
		}

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
		const touch = e.touches[0];

		// For drag operations, verify this touch matches the one that started the drag
		if (dragState && dragState.touchIdentifier !== null &&
		    touch.identifier !== dragState.touchIdentifier) {
			// This is a different touch - ignore it
			return;
		}

		e.preventDefault();
		handleMove(touch.clientX, touch.clientY);
	}
}, { passive: false });

document.addEventListener('touchend', (e) => {
	// If we have an active drag state, only end it if the touch that's ending
	// matches the touch that started the drag
	if (dragState && dragState.touchIdentifier !== null && e.changedTouches.length > 0) {
		let matchingTouchEnded = false;
		for (let i = 0; i < e.changedTouches.length; i++) {
			if (e.changedTouches[i].identifier === dragState.touchIdentifier) {
				matchingTouchEnded = true;
				break;
			}
		}
		// Only end the drag if the matching touch ended
		if (!matchingTouchEnded) {
			return;
		}
	}

	handleEnd();

	// Clear any lingering timers even if there's no active drag state
	if (longPressTimer) {
		clearTimeout(longPressTimer);
		longPressTimer = null;
	}
});

document.addEventListener('touchcancel', () => {
	handleEnd();

	if (longPressTimer) {
		clearTimeout(longPressTimer);
		longPressTimer = null;
	}
});

// Intercept wheel events at the document level to prevent page scroll/zoom when the cursor is over an image container.
document.addEventListener('wheel', (e) => {
	const hoveredImage = images.find(img => img.container.contains(e.target) || img.container === e.target);
	if (hoveredImage) {
		e.preventDefault();
	}
}, { passive: false });
