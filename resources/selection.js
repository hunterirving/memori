// Marquee multi-select: drag a box over empty grid to select images, then move them as a unit

let selectedImages = new Set();
let marqueeState = null;
const MARQUEE_FADE_MS = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--marquee-fade'));

const selectionBox = document.createElement('div');
selectionBox.className = 'selection-box';
grid.appendChild(selectionBox);

function isSelected(imageData) {
	return selectedImages.has(imageData);
}

function setSelection(imageList) {
	clearSelection();
	imageList.forEach(img => {
		selectedImages.add(img);
		img.container.classList.add('selected');
	});
}

function clearSelection() {
	selectedImages.forEach(img => img.container.classList.remove('selected'));
	selectedImages.clear();
}

// Snap a client point to the nearest cell boundary (0..GRID_COLS / 0..GRID_ROWS)
function pointToBoundary(clientX, clientY) {
	const gridRect = grid.getBoundingClientRect();
	const cellSize = getCellSize();
	return {
		col: Math.max(0, Math.min(GRID_COLS, Math.round((clientX - gridRect.left) / cellSize.width))),
		row: Math.max(0, Math.min(GRID_ROWS, Math.round((clientY - gridRect.top) / cellSize.height)))
	};
}

function marqueeRect() {
	return {
		x0: Math.min(marqueeState.anchorCol, marqueeState.col),
		y0: Math.min(marqueeState.anchorRow, marqueeState.row),
		x1: Math.max(marqueeState.anchorCol, marqueeState.col),
		y1: Math.max(marqueeState.anchorRow, marqueeState.row)
	};
}

function updateMarquee() {
	const { x0, y0, x1, y1 } = marqueeRect();
	const widthCells = x1 - x0;
	const heightCells = y1 - y0;

	if (widthCells === 0 || heightCells === 0) {
		selectionBox.style.display = 'none';
		clearSelection();
		return;
	}

	const bounds = getPixelPerfectBounds(x0, y0, widthCells, heightCells);
	selectionBox.style.display = 'block';
	selectionBox.style.left = bounds.left + 'px';
	selectionBox.style.top = bounds.top + 'px';
	selectionBox.style.width = bounds.width + 'px';
	selectionBox.style.height = bounds.height + 'px';

	setSelection(images.filter(img =>
		img.xCell < x1 && img.xCell + img.widthCells > x0 &&
		img.yCell < y1 && img.yCell + img.heightCells > y0
	));
}

grid.addEventListener('mousedown', (e) => {
	if (e.button !== 0) return;
	if (e.target.closest('.image-container')) return;

	e.preventDefault();
	clearSelection();

	const { col, row } = pointToBoundary(e.clientX, e.clientY);
	marqueeState = { anchorCol: col, anchorRow: row, col, row };
	document.body.classList.add('selecting');
});

function handleMarqueeMove(clientX, clientY) {
	if (!marqueeState) return;
	const { col, row } = pointToBoundary(clientX, clientY);
	if (col === marqueeState.col && row === marqueeState.row) return;
	marqueeState.col = col;
	marqueeState.row = row;
	updateMarquee();
}

function fadeOutMarquee() {
	const ghost = selectionBox.cloneNode();
	ghost.classList.add('releasing');
	grid.appendChild(ghost);
	setTimeout(() => ghost.remove(), MARQUEE_FADE_MS + 50);
}

function endMarquee() {
	if (!marqueeState) return;
	marqueeState = null;
	document.body.classList.remove('selecting');

	if (selectionBox.style.display === 'none') return;
	fadeOutMarquee();
	selectionBox.style.display = 'none';
}

document.addEventListener('mousemove', (e) => handleMarqueeMove(e.clientX, e.clientY));
document.addEventListener('mouseup', endMarquee);

// Delete/Backspace deletes all selected images (same as shift+click)
document.addEventListener('keydown', (e) => {
	if (e.key !== 'Delete' && e.key !== 'Backspace') return;
	if (selectedImages.size === 0) return;

	e.preventDefault();
	Array.from(selectedImages).forEach(deleteImage);
});

// Bounds shared by group drag, duplicate, and rotate
function selectionBounds(group) {
	return {
		minX: Math.min(...group.map(img => img.xCell)),
		minY: Math.min(...group.map(img => img.yCell)),
		maxX: Math.max(...group.map(img => img.xCell + img.widthCells)),
		maxY: Math.max(...group.map(img => img.yCell + img.heightCells))
	};
}
