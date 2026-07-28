// Getting images into the app: cursor tracking, clipboard paste, drag and drop

// Track mouse position for paste placement
let lastMouseX = -1;
let lastMouseY = -1;
document.addEventListener('mousemove', (e) => {
	lastMouseX = e.clientX;
	lastMouseY = e.clientY;
});

// Clipboard paste support
document.addEventListener('paste', async (e) => {
	const items = e.clipboardData?.items;
	if (!items) return;

	const imageFiles = [];
	for (const item of items) {
		if (item.type.startsWith('image/')) {
			const file = item.getAsFile();
			if (file) imageFiles.push(file);
		}
	}

	if (imageFiles.length === 0) {
		showPopup('No image found in clipboard');
		return;
	}

	// Use last known mouse position relative to grid, fall back to (0, 0)
	const gridRect = grid.getBoundingClientRect();
	const mouseXInGrid = lastMouseX - gridRect.left;
	const mouseYInGrid = lastMouseY - gridRect.top;
	const isOnGrid = mouseXInGrid >= 0 && mouseYInGrid >= 0 &&
		mouseXInGrid <= gridRect.width && mouseYInGrid <= gridRect.height;

	const dropX = isOnGrid ? mouseXInGrid : 0;
	const dropY = isOnGrid ? mouseYInGrid : 0;

	await processAndAddImages(imageFiles, dropX, dropY);
});

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
