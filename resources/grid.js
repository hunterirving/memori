// Paper dimensions in mm
const LETTER_WIDTH_MM = 215.9;  // 8.5 inches
const LETTER_HEIGHT_MM = 279.4; // 11 inches
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 6.35; // 0.25 inches

// Calculate maximum grid dimensions that fit both Letter and A4 with margins
function calculateGridDimensions(cellSize) {
	// Available printable area (limiting factor is the smaller of Letter/A4 for each dimension)
	const availableWidth = Math.min(LETTER_WIDTH_MM, A4_WIDTH_MM) - (2 * MARGIN_MM);
	const availableHeight = Math.min(LETTER_HEIGHT_MM, A4_HEIGHT_MM) - (2 * MARGIN_MM);

	// Calculate how many cells fit
	const cols = Math.floor(availableWidth / cellSize);
	const rows = Math.floor(availableHeight / cellSize);

	return { cols, rows };
}

// Calculate grid dimensions as percentage of Letter paper (used for screen layout)
function calculateGridPercentages(cellSize, cols, rows) {
	const gridWidthMM = cols * cellSize;
	const gridHeightMM = rows * cellSize;
	return {
		widthPercent: (gridWidthMM / LETTER_WIDTH_MM) * 100,
		heightPercent: (gridHeightMM / LETTER_HEIGHT_MM) * 100
	};
}

// Cell size bounds (in mm)
const MIN_CELL_SIZE_MM = 2;
const MAX_CELL_SIZE_MM = 10;

let GRID_COLS = 49;
let GRID_ROWS = 66;
let CELL_SIZE_MM = 4; // Physical size of each cell when printed (can be overridden by URL parameter)

const grid = document.getElementById('grid');

// Parse URL parameters for custom cell size
function parseCellSizeFromURL() {
	const urlParams = new URLSearchParams(window.location.search);
	const gridSizeParam = urlParams.get('grid-size');

	if (gridSizeParam) {
		// Remove 'mm' suffix if present
		const sizeStr = gridSizeParam.toLowerCase().replace('mm', '').trim();
		const size = parseFloat(sizeStr);

		// Check if size is valid
		if (isNaN(size)) {
			showPopup('Invalid grid size. Using default 4mm.', 3000);
			return 4;
		}

		// Check if size is within reasonable bounds
		if (size < MIN_CELL_SIZE_MM || size > MAX_CELL_SIZE_MM) {
			showPopup(`Grid size must be between ${MIN_CELL_SIZE_MM}mm and ${MAX_CELL_SIZE_MM}mm. Using default 4mm.`, 3500);
			return 4;
		}

		showPopup(`Grid set to ${size}mm`);
		return size;
	}

	return 4; // Default
}

// Initialize cell size from URL
CELL_SIZE_MM = parseCellSizeFromURL();

// Calculate grid dimensions based on cell size
const gridDimensions = calculateGridDimensions(CELL_SIZE_MM);
GRID_COLS = gridDimensions.cols;
GRID_ROWS = gridDimensions.rows;

// Calculate grid percentages for screen layout
const gridPercentages = calculateGridPercentages(CELL_SIZE_MM, GRID_COLS, GRID_ROWS);

// Update CSS variables for both screen and print
document.documentElement.style.setProperty('--cell-size-mm', `${CELL_SIZE_MM}mm`);
document.documentElement.style.setProperty('--grid-cols', GRID_COLS);
document.documentElement.style.setProperty('--grid-rows', GRID_ROWS);
document.documentElement.style.setProperty('--grid-width-percent', `${gridPercentages.widthPercent}%`);
document.documentElement.style.setProperty('--grid-height-percent', `${gridPercentages.heightPercent}%`);

// Calculate cell size dynamically based on actual grid dimensions
function getCellSize() {
	const gridRect = grid.getBoundingClientRect();
	return {
		width: gridRect.width / GRID_COLS,
		height: gridRect.height / GRID_ROWS,
		totalWidth: gridRect.width,
		totalHeight: gridRect.height
	};
}

// Calculate pixel-perfect position for a cell range
function getPixelPerfectBounds(cellX, cellY, cellWidth, cellHeight) {
	// Get all grid cells and measure their actual positions
	const gridCells = grid.querySelectorAll('.grid-cell');

	// Calculate the index of the top-left cell
	const startCellIndex = cellY * GRID_COLS + cellX;
	const startCell = gridCells[startCellIndex];

	if (!startCell) {
		// Fallback if cell doesn't exist
		const cellSize = getCellSize();
		return {
			left: cellX * cellSize.width,
			top: cellY * cellSize.height,
			width: cellWidth * cellSize.width,
			height: cellHeight * cellSize.height
		};
	}

	// Get the actual position of the start cell relative to the grid
	const gridRect = grid.getBoundingClientRect();
	const startCellRect = startCell.getBoundingClientRect();

	const left = startCellRect.left - gridRect.left;
	const top = startCellRect.top - gridRect.top;

	// Calculate end position by finding the bottom-right cell
	const endCellIndex = (cellY + cellHeight - 1) * GRID_COLS + (cellX + cellWidth - 1);
	const endCell = gridCells[endCellIndex];

	if (!endCell) {
		// Fallback if end cell doesn't exist
		const cellSize = getCellSize();
		return {
			left: left,
			top: top,
			width: cellWidth * cellSize.width,
			height: cellHeight * cellSize.height
		};
	}

	const endCellRect = endCell.getBoundingClientRect();
	const right = endCellRect.right - gridRect.left;
	const bottom = endCellRect.bottom - gridRect.top;

	return {
		left: left,
		top: top,
		width: right - left,
		height: bottom - top
	};
}

// Create grid cells
for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
	const cell = document.createElement('div');
	cell.className = 'grid-cell';

	// Add right border to rightmost column
	const col = i % GRID_COLS;
	if (col === GRID_COLS - 1) {
		cell.classList.add('right-edge');
	}

	// Add bottom border to bottom row
	const row = Math.floor(i / GRID_COLS);
	if (row === GRID_ROWS - 1) {
		cell.classList.add('bottom-edge');
	}

	grid.appendChild(cell);
}

// Apply solid border style for grids 3.56mm or smaller
if (CELL_SIZE_MM <= 3.56) {
	document.documentElement.classList.add('solid-grid');
}
