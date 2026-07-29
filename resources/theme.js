// Theme system
let currentThemeIndex = 0;
let isF2Pressed = false;
const themes = ['sea-breeze', 'grape-soda', 'grapefruit', 'guac', 'mojito', 'banana', 'pantry'];
const DEFAULT_THEME = 'guac';
const DEFAULT_DARK_THEME = 'pantry';

function syncThemeColorMeta() {
	const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--desk').trim();
	document.querySelector('meta[name="theme-color"]').setAttribute('content', backgroundColor);
}

function setTheme(theme) {
	document.documentElement.setAttribute('data-theme', theme);
	syncThemeColorMeta();
}

document.documentElement.addEventListener('transitionend', (e) => {
	if (e.propertyName === '--desk') {
		syncThemeColorMeta();
	}
});

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
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const theme = prefersDark ? DEFAULT_DARK_THEME : DEFAULT_THEME;
		currentThemeIndex = themes.indexOf(theme);
		setTheme(theme);
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
