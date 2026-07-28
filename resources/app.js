// Wiring that spans the other files

// Update all image positions when window resizes (for responsive scaling)
window.addEventListener('resize', () => {
	applyPageWidth(); // display or zoom may have changed
	images.forEach(img => {
		updateImagePosition(img);
	});
});

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
