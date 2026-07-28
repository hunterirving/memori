// Theme system
let currentThemeIndex = 0;
let isF2Pressed = false;
const themes = ['sea-breeze', 'grape-soda', 'grapefruit', 'guac', 'mojito', 'banana'];

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
