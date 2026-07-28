// Estimate physical display density so we can attempt to render the page at print size

// Detect Safari browser
function isSafari() {
	const ua = navigator.userAgent;
	return ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium');
}

const isUsingSafari = isSafari();

const isUsingWindows = navigator.userAgent.includes('Windows');

const PANEL_PPI = {
	1920: 141,   // 15.6" 1080p laptop
	2560: 109,   // 27" 1440p
	2736: 267,   // 12.3" 3:2 tablet
	2880: 267,   // 13" 3:2 tablet
	3840: 163    // 27" 4K
};

function estimateWindowsPPI() {
	const pixelRatio = window.devicePixelRatio;
	if (pixelRatio === 1) return null;

	const nativeWidth = screen.width * pixelRatio;
	if (nativeWidth >= 3800 && pixelRatio >= 2) return null;

	const panel = Object.keys(PANEL_PPI).find(width => Math.abs(width - nativeWidth) <= width * 0.02);

	return panel ? PANEL_PPI[panel] / pixelRatio : null;
}

function estimateScreenPPI() {
	const logicalWidth = screen.width;
	const pixelRatio = window.devicePixelRatio;

	if (isUsingWindows) {
		const windowsPPI = estimateWindowsPPI();
		if (windowsPPI) return windowsPPI;
	}

	if (logicalWidth >= 3840) return 163;    // 27" 4K, OS scaling off
	if (logicalWidth >= 2048) return 109;    // 27" 5K retina or 1440p
	if (logicalWidth >= 1800) return 92.6;   // 23.8" 1080p and friends

	return pixelRatio > 1 ? 127.7 : 92.6;    // retina laptop (2560px / 227ppi), else standard density
}

// Life-size page width; CSS clamps this to the viewport so it never overflows horizontally
function applyPageWidth() {
	const pageWidth = (LETTER_WIDTH_MM / 25.4) * estimateScreenPPI();
	document.documentElement.style.setProperty('--page-width', `${pageWidth}px`);
	updateGridLineWidth();
}

const baselinePixelRatio = window.devicePixelRatio;

function updateGridLineWidth() {
	const zoom = window.devicePixelRatio / baselinePixelRatio;
	document.documentElement.style.setProperty('--line-width', `${Math.min(1, 1 / zoom)}px`);
}

applyPageWidth();
