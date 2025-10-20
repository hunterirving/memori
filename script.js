const MM_TO_PX = 96 / 25.4;
const CELL_SIZE_MM = 4;
const CELL_SIZE_PX = CELL_SIZE_MM * MM_TO_PX;
const GRID_OFFSET_IN = 0.25;
const GRID_OFFSET_PX = GRID_OFFSET_IN * 96;
const GRID_COLS = 50;
const GRID_ROWS = 66;

const grid = document.getElementById('grid');
const page = document.querySelector('.page');

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
	const gridWidth = GRID_COLS * CELL_SIZE_PX;
	const gridHeight = GRID_ROWS * CELL_SIZE_PX;

	// Clamp drop position to grid boundaries
	let dropX = e.clientX - gridRect.left;
	let dropY = e.clientY - gridRect.top;
	dropX = Math.max(0, Math.min(gridWidth, dropX));
	dropY = Math.max(0, Math.min(gridHeight, dropY));

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
				let xCell = Math.round(dropX / CELL_SIZE_PX - firstImageDimensions.widthCells / 2) + (idx * 2);
				let yCell = Math.round(dropY / CELL_SIZE_PX - firstImageDimensions.heightCells / 2);

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
		const containerWidth = imageData.widthCells * CELL_SIZE_PX;
		const containerHeight = imageData.heightCells * CELL_SIZE_PX;
		const scaleX = containerWidth / img.naturalWidth;
		const scaleY = containerHeight / img.naturalHeight;
		imageData.baseScale = Math.max(scaleX, scaleY);

		updateImagePosition(imageData);
	};
	images.push(imageData);

	updateImagePosition(imageData);
	grid.appendChild(container);

	setupImageHandlers(imageData);
}

function calculatePanBounds(imageData) {
	const containerWidth = imageData.widthCells * CELL_SIZE_PX;
	const containerHeight = imageData.heightCells * CELL_SIZE_PX;

	if (imageData.naturalWidth === 0 || imageData.naturalHeight === 0) {
		return { maxPanX: 0, maxPanY: 0 };
	}

	// Calculate actual rendered size with both base scale and user scale
	const totalScale = imageData.baseScale * imageData.userScale;
	const renderedWidth = imageData.naturalWidth * totalScale;
	const renderedHeight = imageData.naturalHeight * totalScale;

	// Calculate maximum pan in each direction
	const maxPanX = Math.max(0, (renderedWidth - containerWidth) / 2);
	const maxPanY = Math.max(0, (renderedHeight - containerHeight) / 2);

	return { maxPanX, maxPanY };
}

function clampPan(imageData) {
	const { maxPanX, maxPanY } = calculatePanBounds(imageData);
	imageData.panX = Math.max(-maxPanX, Math.min(maxPanX, imageData.panX));
	imageData.panY = Math.max(-maxPanY, Math.min(maxPanY, imageData.panY));
}

function updateImagePosition(img) {
	img.container.style.left = img.xCell * CELL_SIZE_PX + 'px';
	img.container.style.top = img.yCell * CELL_SIZE_PX + 'px';
	img.container.style.width = img.widthCells * CELL_SIZE_PX + 'px';
	img.container.style.height = img.heightCells * CELL_SIZE_PX + 'px';

	// Update dimension labels
	const widthLabel = img.container.querySelector('.dimension-label.width');
	const heightLabel = img.container.querySelector('.dimension-label.height');
	if (widthLabel) widthLabel.textContent = img.widthCells;
	if (heightLabel) heightLabel.textContent = img.heightCells;

	// Recalculate baseScale if container size changed
	if (img.naturalWidth > 0 && img.naturalHeight > 0) {
		const containerWidth = img.widthCells * CELL_SIZE_PX;
		const containerHeight = img.heightCells * CELL_SIZE_PX;
		const scaleX = containerWidth / img.naturalWidth;
		const scaleY = containerHeight / img.naturalHeight;
		img.baseScale = Math.max(scaleX, scaleY);

		// Reclamp pan after recalculating base scale
		clampPan(img);
	}

	// Apply image positioning and scale using transform
	const imgElement = img.container.querySelector('img');
	if (imgElement) {
		const totalScale = img.baseScale * img.userScale;
		// Transform: translate from center (-50%, -50%), then pan, then scale
		imgElement.style.transform = `translate(-50%, -50%) translate(${img.panX}px, ${img.panY}px) scale(${totalScale})`;
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

	// Moving / Deleting
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
			const cursorX = e.clientX - rect.left - rect.width / 2;
			const cursorY = e.clientY - rect.top - rect.height / 2;

			const oldUserScale = imageData.userScale;
			const oldTotalScale = imageData.baseScale * oldUserScale;
			const zoomDelta = -e.deltaY * 0.01;
			const newUserScale = Math.max(1, Math.min(5, oldUserScale * (1 + zoomDelta)));
			const newTotalScale = imageData.baseScale * newUserScale;

			// Adjust pan to keep the point under cursor fixed during zoom
			const scaleRatio = newTotalScale / oldTotalScale;
			imageData.panX = cursorX * (1 - scaleRatio) + imageData.panX * scaleRatio;
			imageData.panY = cursorY * (1 - scaleRatio) + imageData.panY * scaleRatio;
			imageData.userScale = newUserScale;

			// Clamp after zooming to prevent whitespace
			clampPan(imageData);
		} else {
			// Pan (two-finger scroll on macOS trackpad)
			imageData.panX -= e.deltaX;
			imageData.panY -= e.deltaY;

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

		const dxCells = Math.round(dx / CELL_SIZE_PX);
		const dyCells = Math.round(dy / CELL_SIZE_PX);

		const newXCell = Math.max(0, Math.min(GRID_COLS - dragState.image.widthCells, dragState.startXCell + dxCells));
		const newYCell = Math.max(0, Math.min(GRID_ROWS - dragState.image.heightCells, dragState.startYCell + dyCells));

		dragState.image.xCell = newXCell;
		dragState.image.yCell = newYCell;
		updateImagePosition(dragState.image);
	}

	if (resizeState) {
		const dx = e.clientX - resizeState.startX;
		const dy = e.clientY - resizeState.startY;

		const dxCells = Math.round(dx / CELL_SIZE_PX);
		const dyCells = Math.round(dy / CELL_SIZE_PX);

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
