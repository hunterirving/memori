// Transient notification displayed for grid size changes, paste failures, etc.

let popupElement = null;
let popupTimeout = null;

function showPopup(message, displayDuration = 1250) {
	if (!popupElement) {
		popupElement = document.createElement('div');
		popupElement.className = 'popup-notification';
		document.body.appendChild(popupElement);
	}

	if (popupTimeout) clearTimeout(popupTimeout);

	popupElement.textContent = message;
	popupElement.classList.remove('fade-out');
	popupElement.classList.add('show');

	popupTimeout = setTimeout(() => {
		popupElement.classList.remove('show');
		popupElement.classList.add('fade-out');
	}, displayDuration);
}
