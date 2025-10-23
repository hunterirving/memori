# memori
The Hobonichi Techo is a "<a href="https://www.1101.com/store/techo/en/about/">Life Book</a>" with one page for each day of the year. I use mine as a daily planner, journal, and sketchbook.

This year, Hobonichi announced an official <a href="https://techoapp.1101.com/en/">Hobonichi Techo App</a>, which, among other features, lets users print photos that are perfectly sized to fit the Techo's 4x4mm grid paper.

<img src="readme_images/cut_and_paste.jpg">

Two tiny problems with this:
<ol>
	<li>
		The app is Japan-exclusive until December 2025
	</li>
	<li>
		The Memory Print feature requires a paid subscription:
	</li>
</ol>
<img src="readme_images/premium_plan.jpg">
<br><br>
So here's a web app that does the same thing (and then some) for free.

## usage
<a href="https://hunterirving.github.io/memori">Open memori in your web browser</a>, then drag images from your desktop onto the grid.
- resize images using the edge/corner resize handles
- click and drag an image from the center to relocate it
- hover an image and pinch to zoom (on supported trackpads)
	- ctrl + scroll works too
- hover an image and drag with two fingers to pan (set the part of the image that's visible)
- ```⌘ + click``` an image to duplicate it
- ```option + click``` an image to rotate it
- ```shift + click``` an image to delete it
- press ```F2``` to select from one of six user interface themes

Once you've filled out the page, press ```⌘ + P``` to print using your system's default print dialog.

<img src="readme_images/printed.jpg">

>[!TIP]
>For best results...
>- select "Scale: 100%" rather than "Fit to page width"
>- set Margins to None or 0

Use an X-Acto knife and a straightedge to cut your images to size.

<img src="readme_images/cut_out.jpg">

Stick 'em down with a gluestick (or try with sticker paper):

<img src="readme_images/spread.jpg">
<img src="readme_images/spread2.jpg">


## future enhancements
- PWA support
- better mobile support
	- for Safari on iOS, generate pre-rendered PDFs to avoid printing with headers, footers, and margins
- support for Japanese grid cell dimensions (3.7mm)
- support for common international paper sizes (other than 8.5 x 11in)