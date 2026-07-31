// Theme system
let currentThemeIndex = 0;
let isF2Pressed = false;
const themes = ['sea-breeze', 'grape-soda', 'grapefruit', 'guac', 'mojito', 'banana', 'pantry'];
const DEFAULT_THEME = 'guac';
const DEFAULT_DARK_THEME = 'pantry';
const THEME_TRANSITION_MS = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--theme-transition'));
let pageTransitionTimer = null;

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

// Only do border-radius transition on page when changing themes
function withPageTransition() {
	const page = document.querySelector('.page');
	if (!page) return;

	page.classList.add('theming');
	clearTimeout(pageTransitionTimer);
	pageTransitionTimer = setTimeout(() => page.classList.remove('theming'), THEME_TRANSITION_MS + 50);
}

function cycleTheme(step = 1) {
	currentThemeIndex = (currentThemeIndex + step + themes.length) % themes.length;
	const newTheme = themes[currentThemeIndex];
	withPageTransition();
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

// F2 cycles themes, shift+F2 cycles backwards
document.addEventListener('keydown', (e) => {
	if (e.key === 'F2' && !isF2Pressed) {
		e.preventDefault();
		isF2Pressed = true;
		cycleTheme(e.shiftKey ? -1 : 1);
	}
});

document.addEventListener('keyup', (e) => {
	if (e.key === 'F2') {
		isF2Pressed = false;
	}
});

// Load theme on page load
loadThemeFromLocalStorage();
