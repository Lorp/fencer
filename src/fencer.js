"use strict"

import hbjs from "./harfbuzz/hbjs.js";
import { SamsaFont, SamsaBuffer } from "./samsa-core/samsa-core.js"; // import samsa-core https://github.com/Lorp/samsa-core
import { VariationModel } from "./fontra-src-client-core/var-model.js"; // import Fontra var-model https://github.com/googlefonts/fontra

const svgArrowHandleRadius = 12;
const svgCurrentLocationRadius = 7;
const svgArrowLineWidth = 2;
const svgMappingHandle = `<circle cx="0" cy="0" r="${svgArrowHandleRadius}" fill="currentColor" stroke="none"/>`;
const svgCurrentLocation = `<circle cx="0" cy="0" r="${svgCurrentLocationRadius+svgArrowLineWidth}" fill="white" stroke="none"/><circle cx="0" cy="0" r="${svgCurrentLocationRadius}" fill="currentColor" stroke="none"/>`;
const instanceColor = "#f00";
const ioStr = ["input","output"];

const GLOBAL = {
	svgElWidth: 400,
	mappings: [],
	current: [[],[]],
	draggingIndex: -1, // starts current location, not a mapping
	mappingsView: [],
	axisTouched: -1,
	fontFace: undefined,
	fontBuffer: undefined,
	instances: [],
	renderers: {
		browser: "browser",
		polyfill: "simple polyfill",
		harfbuzz: "harfbuzz",
		samsa: "samsa",
	},
	renderFontSize: 200,
};

function Q (selector) {
	return document.querySelector(selector)
}

function Qall (selector) {
	return document.querySelectorAll(selector)
}

function EL (tag, attrs) {
	let el = document.createElement(tag)
	el.attr(attrs)
	return el
}

function SVG (tag, attrs) {
	let el = document.createElementNS("http://www.w3.org/2000/svg", tag)
	el.attr(attrs)
	return el
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function valueInAxisRange(value, axis) {
	return typeof value === "number" && value >= axis.minValue && value <= axis.maxValue;
}

Element.prototype.attr = function (attrs) {
	for (const prop in attrs) {
		this.setAttributeNS(null, prop, attrs[prop])
	}
}

Element.prototype.setPosition = function (position) {
	this.setAttribute("transform", `translate(${position[0]},${position[1]})`)
}

function simpleNormalize(axis, value) {
	if (value === axis.defaultValue) {
		return 0;
	}
	else if (value <= axis.minValue) {
		return -1;
	}
	else if (value >= axis.maxValue) {
		return 1;
	}
	else if (value < axis.defaultValue) {
		const val = (value - axis.defaultValue) / (axis.defaultValue - axis.minValue);
		return Math.round(val * 16384) / 16384;
	}
	else if (value > axis.defaultValue) {
		const val = (value - axis.defaultValue) / (axis.maxValue - axis.defaultValue);
		return Math.round(val * 16384) / 16384;
	}
	return undefined; // never gets here
}

// takes a mapping and makes all its values normalized to the range [-1, 1], represented in f2.14, so actually as integers in the range [-16384, 16384]
function mappingSimpleNormalize(axes, mapping) {

	const normalizedMapping = [[],[]];
	axes.forEach((axis, a) => {
		normalizedMapping[0][a] = simpleNormalize(axis, mapping[0][a]);
		normalizedMapping[1][a] = simpleNormalize(axis, mapping[1][a]);
	});
	return normalizedMapping;
}


// keyboard shorcuts
window.onkeydown = e => {

	// textarea and input should ignore this
	if (["TEXTAREA","INPUT"].includes(e.target.tagName))
		return;

	//console.log(e);
	if (e.code === "KeyM") addMapping(); // m = add mapping
	if (e.code === "KeyV") addView(); // v = add view
}


/*

// we can repurpose this code for adding/subtracting epsilon

window.onkeydown = function (e) {

	// disable for input elements!
	if (e.target.tagName === "INPUT")
		return;

	let delta = 0;
	switch (e.key) {
		case "ArrowUp":
			if (GLOBAL.draggingIndex !== -1) delta = 1; break;
		case "ArrowRight":
			delta = 1; break;
		case "ArrowDown":
			if (GLOBAL.draggingIndex !== -1) delta = -1; break; 
		case "ArrowLeft":
			delta = -1; break;
		default:
			return; break;
	
	}

	e.stopPropagation();
	e.preventDefault();

	// modify output of current location? do nothing
	if (GLOBAL.draggingIndex === -1 && e.shiftKey) {
		return;
	}

	// if delta is 0, do nothing
	if (delta === 0) return;


	console.log("Want to move: ");
	console.log("Mapping", GLOBAL.draggingIndex);
	console.log("Axes", getVisibleAxisIds());
	console.log("I/O", e.shiftKey);

	const inputOrOutput = +e.shiftKey; // 0 for input, 1 for output
	const xOrY = +["ArrowUp","ArrowDown"].includes(e.key); // 0 for x, 1 for y
	//const visibleAxisIds = getVisibleAxisIds();
	//const axisId = getVisibleAxisIds()[inputOrOutput];
	const axisId = getVisibleAxisIds()[xOrY];
	const axis = GLOBAL.font.fvar.axes[axisId];

	let value = GLOBAL.draggingIndex === -1 ? GLOBAL.current[inputOrOutput][axisId] : GLOBAL.mappings[GLOBAL.draggingIndex][inputOrOutput][axisId];
	value = clamp(value + delta, axis.minValue, axis.maxValue);
	if (GLOBAL.draggingIndex === -1) {
		GLOBAL.current[inputOrOutput][axisId] = value;
	}
	else {
		GLOBAL.mappings[GLOBAL.draggingIndex][inputOrOutput][axisId] = value;
	}

	updateMappingsSliders(GLOBAL.draggingIndex);
	//updateMappingsSVG();
	updateMappingsXML();
	updateRenders();

}
*/

function mappingsSelectorPopulate() {

	const selectEl = Q("#mapping-selector");

	selectEl.innerHTML = "";

	const optionEl = EL("option");
	optionEl.value = -1;
	optionEl.textContent = "Current";
	selectEl.append(optionEl);

	GLOBAL.mappings.forEach((mapping, m) => {

		const optionEl = EL("option");
		optionEl.value = m;
		optionEl.textContent = "Mapping " + m;
		selectEl.append(optionEl);
	
	});

}


// often, xAxisId and yAxisId are undefined, in which case we get the first axis that is not already in a view
// - for simplicity, either set both axisIds or neither
function addView(e, xAxisId, yAxisId) {
	const axes = GLOBAL.font.fvar.axes;
	let axisIds = [xAxisId, yAxisId]; // these will be overridden if undefined
	const otherViewEls = Qall(".window.view");
	let left = 420, top = 10;
	if (otherViewEls.length) {
		const lastViewEl = otherViewEls[otherViewEls.length-1];
		left = parseFloat(lastViewEl.style.left) + 10;
		top = parseFloat(lastViewEl.style.top) + 10;
	}

	const viewEl = EL("div", {class: "window view", style: `width: 500px; height: 500px; left: ${left}px; top: ${top}px;`});
	viewEl.dataset.axisIds = axisIds.join();
	viewEl.innerHTML = 
`	<h2>View <span class="description"></span></h2>

	<div class="content">

		<div></div><div></div><div class="ruler horizontal"><div class="puck hidden"></div></div><div></div>
		<div></div><div></div><div></div><div></div>
		<div class="ruler vertical"><div class="puck hidden"></div></div><div></div>
			<div class="svg-container"></div>
		<div></div>
		<div></div><div></div><div></div><div></div>

		<div class="extra" style="grid-column: 1/5;">

			<div class="axis-selector">
				X <select class="x"></select>
				Y <select class="y"></select>
			</div>

			<div class="mappings-ui-info">
				<div class="coords"></div>
			</div>
	
		</div>

	</div>

	<div class="close"></div>
	<div class="resize"></div>	
`;

	// which axes is this view looking at?
	if (xAxisId === undefined || yAxisId === undefined) { // for simplicity, you either set both axisIds or neither

		// work out which axes to assign to the view: we’ll take the fist two that are not assigned in other views
		const assignedAxisIds = new Set();
		Qall(".window.view").forEach(viewEl => {
			if (viewEl.dataset.axisIds) {
				viewEl.dataset.axisIds.split(",").map(str => parseInt(str)).forEach(axisId => assignedAxisIds.add(axisId));
			}
		});

		const availableAxisIds = [];
		for (let a=0; a<GLOBAL.font.fvar.axisCount; a++) {
			if (!assignedAxisIds.has(a))
				availableAxisIds.push(a);
		}

		// now the first two items in availableAxisIds will be this view’s axisIds
		const assignedAxisIds_ = [...assignedAxisIds]; // arrayify the set
		axisIds.length = 0;
		if (availableAxisIds.length >= 2)
			axisIds.push(availableAxisIds[0], availableAxisIds[1]);
		else if (availableAxisIds.length === 1)
			axisIds.push(availableAxisIds[0], assignedAxisIds_.find(a => a !== availableAxisIds[0]));
		else
			axisIds.push(assignedAxisIds_[0], assignedAxisIds_[1]);

		[xAxisId, yAxisId] = axisIds;
	}
	viewEl.dataset.axisIds = axisIds.join(); // store the axisIds in the view
	viewEl.querySelector("h2 .description").textContent = axisIds.map(a => axes[a].axisTag).join(":") + " [" + axisIds.join(":") + "]"; // display the axisIds and tags in the window title

	// create the svg element for this view
	const svgEl = SVG("svg", {class: "mappings-visual"});
	svgEl.append(SVG("g")); // this <g> element has all the content and has a transform	
	viewEl.querySelector(".svg-container").append(svgEl);

	// add the xAxis and yAxis axis selectors to the "extra" div
	const xSelect = viewEl.querySelector(".extra .axis-selector select.x"); //EL("select");
	const ySelect = viewEl.querySelector(".extra .axis-selector select.y"); //EL("select");
	axes.forEach((axis, a) => {
		const optionEl = EL("option");
		optionEl.value = a;
		optionEl.textContent = axis.axisTag;
		xSelect.append(optionEl);
		ySelect.append(optionEl.cloneNode(true));
	});
	xSelect.value = xAxisId;
	ySelect.value = yAxisId;
	xSelect.onchange = ySelect.onchange = e => {
		const viewEl = e.target.closest(".window.view");
		const xAxisId = parseInt(xSelect.value);
		const yAxisId = parseInt(ySelect.value);
		viewEl.dataset.axisIds = [xAxisId, yAxisId].join();
		viewEl.querySelector("h2 .description").textContent = [xAxisId, yAxisId].map(a => axes[a].axisTag).join(":") + " [" + [xAxisId, yAxisId].join(":") + "]";
		mappingsChanged();
	};

	// add the view to the DOM
	Q(".window-canvas").append(viewEl);

	// activate window controls
	windowGiveInteractivity(viewEl);
	updateSVGTransform(viewEl);

	drawView(viewEl);

	// make topmost
	viewEl.querySelector("h2").dispatchEvent(new Event("mousedown"));
}


// returns a string ready to be assigned as the "d" attribute of an SVG <path> element
// - color is assigned later, on the element itself
// - call with getArrowPath({x1: x1, x2: x2, y1: y1, y2: y2, tipLen: tipLen, tipWid: tipWid, strokeWidth: strokeWidth})
function getArrowPath(arrow) {

	const x1 = arrow.x1, y1 = arrow.y1, x2 = arrow.x2, y2 = arrow.y2;
	const tipLen = arrow.tipLen, tipWid = arrow.tipWid;
	const strokeWidth = arrow.strokeWidth ?? 2;
	let pathStr = "";

	if (x2!=x1 || y2!=y1) {
		const len = Math.sqrt((x2-x1)*(x2-x1)+(y2-y1)*(y2-y1));
		const arrowBackX = (y2-y1)/len;
		const arrowBackY = (x2-x1)/len;

		arrow.arrowX1 = arrow.arrowX2 = arrow.newX2 = x1 + (x2-x1) * (len-tipLen)/len;
		arrow.arrowY1 = arrow.arrowY2 = arrow.newY2 = y1 + (y2-y1) * (len-tipLen)/len;
		arrow.arrowX1 += arrowBackX * tipWid/2;
		arrow.arrowY1 -= arrowBackY * tipWid/2;
		arrow.arrowX2 -= arrowBackX * tipWid/2;
		arrow.arrowY2 += arrowBackY * tipWid/2;

		// arrow head (a triangle)
		pathStr += `M${arrow.arrowX1} ${arrow.arrowY1}`; // "left" base of the arrow head
		pathStr += `L${arrow.arrowX2} ${arrow.arrowY2}`; // "right" base of the arrow head
		pathStr += `L${arrow.x2} ${arrow.y2}`; // tip of the arrow head
		pathStr += "Z";

		// arrow line (a thin rectangle)
		const newX2 = x1 + (x2-x1) * (len-tipLen)/len; // in order to preserve the arrow tip, we don’t draw this rectangle all the way to the tip
		const newY2 = y1 + (y2-y1) * (len-tipLen)/len;
		pathStr += `M${x1 + arrowBackX * strokeWidth/2} ${y1 - arrowBackY * strokeWidth/2}`;
		pathStr += `L${newX2 + arrowBackX * strokeWidth/2} ${newY2 - arrowBackY * strokeWidth/2}`;
		pathStr += `L${newX2 - arrowBackX * strokeWidth/2} ${newY2 + arrowBackY * strokeWidth/2}`;
		pathStr += `L${x1 - arrowBackX * strokeWidth/2} ${y1 + arrowBackY * strokeWidth/2}`;
		pathStr += "Z";
	}

	return pathStr;
}

function axisCoordFromSvgCoord (viewEl, a, val) {
	const rect = viewEl.querySelector(".svg-container").getBoundingClientRect();
	const visibleAxisIds = getVisibleAxisIds(viewEl);
	const axis = GLOBAL.font.fvar.axes[a];
	const length = parseFloat((visibleAxisIds[0] === a) ? rect.width : rect.height);
	return val / length * (axis.maxValue - axis.minValue) + axis.minValue;
}

function svgCoordFromAxisCoord (viewEl, a, val) {
	// console.log(viewEl);
	// console.log(viewEl.querySelector(".svg-container"));
	const rect = viewEl.querySelector(".svg-container").getBoundingClientRect();
	// console.log(rect);
	// if (!rect) rect =  Q(".svg-container").getBoundingClientRect();
	const visibleAxisIds = getVisibleAxisIds(viewEl);
	const axis = GLOBAL.font.fvar.axes[a];
	//const rect =  Q(".svg-container").getBoundingClientRect();
	const length = parseFloat((visibleAxisIds[0] === a) ? rect.width : rect.height);
	return Math.round((val - axis.minValue) / (axis.maxValue - axis.minValue) * length * 1000) / 1000; // round to nearest 0.001 (avoids tiny rounding errors that bloat SVG)
}

function svgCoordsFromAxisCoords (viewEl, coords) {
	// if (!rect) rect =  Q(".svg-container").getBoundingClientRect();
	// if (!svgEl) svgEl = Q(".mappings-visual");
	//const [a0, a1] = GLOBAL.mappingsView;
	const [xAxisId, yAxisId] = getVisibleAxisIds(viewEl);
	const s0 = svgCoordFromAxisCoord(viewEl, xAxisId, coords[xAxisId]);
	const s1 = svgCoordFromAxisCoord(viewEl, yAxisId, coords[yAxisId]);
	return [s0, s1];
}

function loadFontFromArrayBuffer (arrayBuffer, options={}) {

	GLOBAL.font = new SamsaFont(new SamsaBuffer(arrayBuffer));
	GLOBAL.familyName = GLOBAL.font.names[6];
	GLOBAL.fontBuffer = GLOBAL.font.buf;

	// reset some stuff
	GLOBAL.draggingIndex = -1;
	GLOBAL.mappings.length = 0;
	GLOBAL.instances.length = 0;

	Q(".render-container").textContent = ""; // reset render-container
	addRender(undefined, GLOBAL.current[0], "Current"); // add render for the current location
	GLOBAL.font.fvar.instances.forEach(instance => addRender(null, instance.coordinates, instance.name)); // add renders for each named instance

	Q(".window.fontinfo .filename").textContent = `${options.filename} (${GLOBAL.font.buf.byteLength} bytes)`;
	Q(".window.fontinfo .name").textContent = GLOBAL.font.names[6];

	// set the font face to the arraybuffer
	if (GLOBAL.fontFace)
		document.fonts.delete(GLOBAL.fontFace);

	//GLOBAL.fontFace = new FontFace(GLOBAL.font.names[6], arrayBuffer);
	// GLOBAL.fontFace = new FontFace("Fencer-initial", arrayBuffer);
	// GLOBAL.fontFace.load().then(loadedFace => {

	// 	document.fonts.add(loadedFace);
	// 	const renderEls = Qall(".render");

	// 	// locked axes are stored in dataset
	// 	renderEls.forEach(renderEl => {
	// 		//renderEl.style.fontFamily = GLOBAL.font.names[6];
	// 		//renderEl.style.fontFamily = "Fencer-initial";
	// 	});

	// 	// activate buttons
	// 	Q("#download-font").disabled = false;
	// 	Q("#add-mapping").disabled = false;
	// 	Q("#delete-mapping").disabled = false;

	// 	// on add/delete mapping button click
	// 	Q("#add-mapping").onclick = addMapping;
	// 	Q("#delete-mapping").onclick = deleteMapping;

	// 	// init the mappings xml
	// 	updateMappingsXML();
	// });

	// reset UI
	// - activate buttons
	Q("#download-font").disabled = false;
	Q("#add-mapping").disabled = false;
	Q("#delete-mapping").disabled = false;
	// - on add/delete mapping button click
	Q("#add-mapping").onclick = addMapping;
	Q("#delete-mapping").onclick = deleteMapping;
	Q("#add-view").onclick = addView;
	// - other stuff
	mappingsSelectorPopulate();
	Qall(".window.view").forEach(viewEl => viewEl.remove()); // remove any existing views
	updateMappingsXML();
	
	// build axis controls

	// 1. add a row for the key
	const keyEl = EL("div");
	keyEl.classList.add("key");
		
	const key = [ EL("div"), EL("div"), EL("div"), EL("div"), EL("div"), EL("div"), EL("div") ];
	key[0].textContent = "TAG";
	key[1].textContent = "INPUT";
	key[2].textContent = "→";
	key[3].textContent = "OUTPUT";
	key[4].textContent = "refresh";
	key[5].textContent = "X";
	key[6].textContent = "Y";
	key[4].style.fontFamily = "Material Symbols Outlined";
	key[4].title = "Reset all input axes\n(shift-click to reset all output axes)";
	key[4].onclick = axisReset;

	keyEl.append(...key);
	Q(".axes").append(keyEl);
	
	// 2. add a row for each axis
	let tabIndex = 1;
	GLOBAL.font.fvar.axes.forEach((axis, a) => {
		const axisEl = EL("div");
		axisEl.classList.add("axis");
		axisEl.dataset.axisId = a;

		const tagEl = EL("input", {
			value: axis.axisTag,
			class: "monospace",
			disabled: true,
			title: `${axis.axisTag} (${axis.name})\nmin: ${axis.minValue}\ndefault: ${axis.defaultValue}\nmax: ${axis.maxValue}`,
		});

		// right-arrow
		const spacerEl = EL("div");
		spacerEl.textContent = "→";

		// input/output numerics
		const inNumEl = EL("input", {
			tabindex: tabIndex++,
			value: axis.defaultValue,
			class: "input numeric"
		});
		const outNumEl = EL("input", {
			tabindex: tabIndex++,
			value: axis.defaultValue,
			class: "output numeric"
		});

		// input/output sliders
		const inEl = EL("input", {
			type: "range",
			tabindex: -1,
			style: "width: 100%",
			min: axis.minValue,
			max: axis.maxValue,
			value: axis.defaultValue,
			step: "0.001",
			class: "input slider"
		});
		const outEl = EL("input", {
			type: "range",
			tabindex: -1,
			style: "width: 100%",
			min: axis.minValue,
			max: axis.maxValue,
			value: axis.defaultValue,
			step: "0.001",
			class: "output slider"
		});

		// set change event for all input elements
		inNumEl.oninput = outNumEl.oninput = inEl.oninput = outEl.oninput = axisChange;
		inNumEl.onchange = outNumEl.onchange = inEl.onchange = outEl.onchange = axisChange;

		const refreshEl = EL("div", {title: "Reset input axis\n(shift-click to reset output axis)", class: "symbol"});
		refreshEl.textContent = "refresh";
		refreshEl.onclick = axisReset;

		const xAxisEl = EL("input", {type: "radio", name: "x-axis", value: a});
		const yAxisEl = EL("input", {type: "radio", name: "y-axis", value: a});
		xAxisEl.checked = a===0;
		yAxisEl.checked = a===1;
		xAxisEl.onchange = yAxisEl.onchange = axisCheckboxChange
		
		// we are populating this grid definition: grid-template-columns: 40px 40px 1fr auto 40px 1fr auto 16px 16px;
		axisEl.append(
			tagEl,
			inNumEl,
			inEl,
			spacerEl,
			outNumEl,
			outEl,
			refreshEl,
			xAxisEl,
			yAxisEl,
		);

		Q(".axes").append(axisEl);

		GLOBAL.current[0][a] = axis.defaultValue;
		GLOBAL.current[1][a] = axis.defaultValue;
	});

	// set initial mode to "axes", make the output axes disabled
	selectAxisControls();

	function axisChange (e) {

		const ioId = +e.target.classList.contains("output");
		const el = e.target;
		const axisEl = el.closest(".axis");
		const axisId = parseInt(axisEl.dataset.axisId);
		const axis = GLOBAL.font.fvar.axes[axisId];
		let val = parseFloat(el.value);
		if (el.classList.contains("slider") && Q("#integer-snapping").checked && ![axis.minValue, axis.maxValue].includes(val)) {
			val = Math.round(val);
			el.value = val;
		}
		const otherInputEl = el.classList.contains("slider") ? axisEl.querySelector(`.${ioStr[ioId]}.numeric`) : axisEl.querySelector(`.${ioStr[ioId]}.slider`);
		otherInputEl.value = val;

		// move the marker
		if (GLOBAL.draggingIndex === -1) {
			GLOBAL.current[0][axisId] = parseFloat(el.value);
		}
		else {
			GLOBAL.mappings[GLOBAL.draggingIndex][ioId][axisId] = parseFloat(el.value);
		}

		GLOBAL.axisTouched = axisId;

		mappingsChanged();
		updateRenders();
		updateMappingsXML();
		formatNumericControls(GLOBAL.draggingIndex);
	}

	function axisReset (e) {
		const el = e.target;
		const parentEl = el.closest(".axis,.key");
		const ioId = +e.shiftKey; // 0 for input, 1 for output

		// is this the "reset all" button in the key row?
		if (parentEl.classList.contains("key")) {

			if (GLOBAL.draggingIndex === -1) {
				GLOBAL.current[0] = getDefaultAxisCoords(); // don’t reset GLOBAL.current[1] directly
			}
			else {
				GLOBAL.mappings[GLOBAL.draggingIndex][ioId] = getDefaultAxisCoords();
			}
		}

		// is this the reset button of an axis row?
		else {
			const axisEl = parentEl;
			const axisId = parseInt(axisEl.dataset.axisId);
			const axis = GLOBAL.font.fvar.axes[axisId];

			if (GLOBAL.draggingIndex === -1) {
				GLOBAL.current[0][axisId] = axis.defaultValue; // don’t reset GLOBAL.current[1] directly
			}
			else {
				GLOBAL.mappings[GLOBAL.draggingIndex][ioId][axisId] = axis.defaultValue;
			}
		}

		// updates
		updateMappingsSliders(GLOBAL.draggingIndex);
		mappingsChanged();
		updateMappingsXML();
		updateRenders();
	}

	function axisCheckboxChange(e) {

		let xSelected, ySelected;
		const orientationChosen = e.target.name === "x-axis" ? "x-axis" : "y-axis";
		const orientationNotChosen = e.target.name === "y-axis" ? "x-axis" : "y-axis";
		Qall(".axes .axis").forEach(axisEl => {
			if (axisEl.querySelector("input[name=x-axis]").checked)
				xSelected = axisEl.querySelector("input[name=x-axis]").value;

			if (axisEl.querySelector("input[name=y-axis]").checked)
				ySelected = axisEl.querySelector("input[name=y-axis]").value;
		});

		// ensure the x and y axis are different: force the other axis to be the first available axis
		// - TODO: check this works for single-axis fonts
		if (xSelected && ySelected && (xSelected === ySelected)) {
			const axisEls = Qall(".axes .axis");
			for (const axisEl of axisEls) {
				if (!axisEl.querySelector(`input[name=${orientationNotChosen}]`).checked) {
					axisEl.querySelector(`input[name=${orientationNotChosen}]`).checked = true;
					break;
				}
			}
		}

		// update the mappingsView array
		Qall(".axes .axis").forEach((axisEl, a) => {
			if (axisEl.querySelector("input[name=x-axis]").checked)
				GLOBAL.mappingsView[0] = a;

			if (axisEl.querySelector("input[name=y-axis]").checked)
				GLOBAL.mappingsView[1] = a;
		});

		// update the title
		Q(".window.mappings-ui h2 .description").textContent = GLOBAL.font.fvar.axes[GLOBAL.mappingsView[0]].axisTag + "/" + GLOBAL.font.fvar.axes[GLOBAL.mappingsView[1]].axisTag;
		console.log(GLOBAL.font.fvar.axes[GLOBAL.mappingsView[0]])

		// redraw the mappings SVG
		// - TODO: decide if we need to update the mappingsView array
		mappingsChanged();

		// fix the rulers
		//updateSVGTransform();
	}
	
	
	// init mappings SVG based on first two axes
	GLOBAL.mappingsView.length = 0;
	if (GLOBAL.font.fvar.axes.length > 0) {
		GLOBAL.mappingsView.push(0); // set x axis to the first axis
		if (GLOBAL.font.fvar.axes.length > 1) {
			GLOBAL.mappingsView.push(1); // set y axis to the second axis
		}
	}

	// init axisTouched
	if (GLOBAL.font.fvar.axes.length > 0)
		GLOBAL.axisTouched = 0;

	// if these axes represent the current location, disable all the initial input elements with class "output"
	if (GLOBAL.draggingIndex === -1) {
		Qall(".axes .axis input.output").forEach(el => el.disabled = true);
	}

	// draw mappings SVG
	//updateSVGTransform();
	mappingsChanged(0);
	updateRenders();

	// create initial view by dispatching event to the "Add view" button
	Q("#add-view").dispatchEvent(new Event("click"));



}

function onDropFont (e) {
	const el = e.target;

	e.preventDefault();

	// delete contents of the axes container
	Q(".axes").innerHTML = "";

	// get arrayBuffer from first dropped object
	const file = e.dataTransfer.files[0];
	file.arrayBuffer().then(arrayBuffer => {

		loadFontFromArrayBuffer(arrayBuffer, {filename: file.name});

	});
}

function getDefaultAxisCoords() {

	return GLOBAL.font.fvar.axes.map(axis => axis.defaultValue);
}

function addRender(e, coords = GLOBAL.current[0], name="Custom", color) {

	// the render item
	const renderItemEl = EL("div");
	renderItemEl.classList.add("render-item");

	// the render itself
	const renderEl = EL("div");
	renderEl.classList.add("render");
	renderEl.innerText = Q("#sample-text").value;
	renderEl.style.fontFamily = GLOBAL.familyName;

	// label
	const labelEl = EL("label");
	labelEl.textContent = name;
	labelEl.style.backgroundColor = color ? color : "var(--currentLocationColor)";

	renderItemEl.append(renderEl, labelEl);

	if (name !== "Current") {

		// the controls icon
		const controlsButtonEl = EL("div");
		controlsButtonEl.classList.add("render-controls-button");
		controlsButtonEl.innerText = "tune";
		controlsButtonEl.onclick = clickControls;

		// the controls
		const controlsEl = EL("div");
		controlsEl.classList.add("render-controls");
		controlsEl.style.display = "none";
		GLOBAL.font.fvar.axes.forEach((axis, a) => {

			// axis row
			const axisEl = EL("div");
			axisEl.classList.add("axis", "locked");

			// axis tag
			const tagEl = EL("div");
			tagEl.textContent = axis.axisTag;

			// value
			const valueEl = EL("input");
			valueEl.classList.add("value");
			valueEl.disabled = true;
			valueEl.value = coords[a];

			// lock/unlock
			const lockEl = EL("div");
			lockEl.classList.add("lock"); // we remove the class "locked" when it is unlocked
			lockEl.onclick = lockElclick;
		
			axisEl.append(tagEl, valueEl, lockEl);
			controlsEl.append(axisEl);

		});

		renderItemEl.append(controlsEl, controlsButtonEl);

		GLOBAL.instances.push([
			[...coords],
			[...coords], // fix this (hmm, what’s wrong with it?... the [1] array gets recalculated in time for the "to" red markers to be positioned correctly)
		])
		
	}

	Q(".render-container").append(renderItemEl);

	updateRenders();

	
}

function lockElclick(e) {
	const lockEl = e.target;
	//lockEl.classList.toggle("locked");

	lockEl.closest(".axis").classList.toggle("locked");
	updateRenders();
}

function clickControls(e) {
	const renderItemEl = e.target.closest(".render-item");
	const controlsEl = renderItemEl.querySelector(".render-controls");

	if (controlsEl.style.display === "none")
		controlsEl.style.display = "block";
	else
		controlsEl.style.display = "none";

}

function sampleTextChange(e) {

	Qall(".render").forEach(renderEl => {
		renderEl.innerText = e.target.value;
	});
}

function addMapping() {

	const from = [];
	const to = [];
	const currentCoords = GLOBAL.current[0];

	// initialize the mapping to the default values
	GLOBAL.font.fvar.axes.forEach((axis, a) => {
		from.push(currentCoords[a]);
		to.push(currentCoords[a]);
	});

	GLOBAL.mappings.push([from, to]);
	GLOBAL.draggingIndex = GLOBAL.mappings.length-1;

	// update stuff
	mappingsSelectorPopulate();

	mappingsChanged();
	updateMappingsSliders(GLOBAL.draggingIndex);
	updateMappingsXML();
	updateRenders();
}

function deleteMapping() {

	if (GLOBAL.draggingIndex >= 0) {

		// we redraw from the updated mappings array, rather than actually removing the SVG elements
		GLOBAL.mappings.splice(GLOBAL.draggingIndex, 1);
		GLOBAL.dragging = undefined;
		GLOBAL.draggingIndex = 0;
	}
	Q("#mapping-selector").value = -1; // select "current" location sliders
	Q("#mapping-selector").dispatchEvent(new Event("change"));

	// update stuff
	mappingsSelectorPopulate();
	mappingsChanged();
	updateMappingsSliders(GLOBAL.draggingIndex);
	updateMappingsXML();
	updateRenders();

}

function getVisibleAxisIds(viewEl) {
	if (viewEl && viewEl.dataset.axisIds !== undefined) {
		return viewEl.dataset.axisIds.split(",").map(a => parseInt(a));
	}
	else {
		const xAxisEl = Q("input[name=x-axis]:checked").closest(".axis");
		const yAxisEl = Q("input[name=y-axis]:checked").closest(".axis");
		const xAxisIndex = parseInt(xAxisEl.dataset.axisId);
		const yAxisIndex = parseInt(yAxisEl.dataset.axisId);
		return [xAxisIndex, yAxisIndex];
	}
}

// return an SVG element that represents an arrow
// - options is an object with the following properties:
// - x1, y1, x2, y2 (required): the start and end points of the arrow
// - index (optional): value to be assigned to dataset.index of the returned element
// - color (optional): color of the arrow (default = currentColor)
// - tipLen (optional): length of the arrowhead (default = 20)
// - tipWid (optional): width of the arrowhead (default = 15)
function svgArrow(options) {

	console.assert (typeof options.x1 === 'number' && typeof options.y1 === 'number' && typeof options.x2 === 'number' && typeof options.y2 === 'number', "Error: All arrow coordinate values must be numbers");

	// defaults
	options.color ??= "currentColor";
	options.strokeWidth ??= 2;
	options.tipLen ??= 20;
	options.tipWid ??= 15;
	
	const arrowSvg = SVG("g");
	arrowSvg.classList.add("arrow");
	if (options.index !== undefined)
		arrowSvg.dataset.index = options.index;

	const pathEl = SVG("path");
	const pathStr = getArrowPath(options); // arrow geometry is calculated here
	pathEl.attr({d: pathStr, stroke: "none" });
	pathEl.style.fill = options.color;

	arrowSvg.append(pathEl);
	return arrowSvg;
}

// update the location[1] values for a given array of location[0] values
function instantiateLocation(location) {
	// find the transformed axis locations, without creating a SamsaInstance
	const normalizedLocation = location[0].map((coord, a) => simpleNormalize(GLOBAL.font.fvar.axes[a], coord));
	if (GLOBAL.ivs) {
		const deltas = SamsaFont.prototype.itemVariationStoreInstantiate(GLOBAL.ivs, normalizedLocation);
		location[1] = denormalizeTuple(normalizedLocation.map((coord, a) => clamp(coord + deltas[0][a]/0x4000, -1, 1)));
	}
	else {
		location[0].forEach((val, i) => location[1][i] = val); // make a copy
	}
}

function drawView(viewEl) {

	// ok start redrawing the SVG
	const svgEl = viewEl.querySelector(".mappings-visual")
	const g = viewEl.querySelector(".mappings-visual g")
	g.innerHTML = "";

	// get base rectangle
	const rect = viewEl.querySelector(".svg-container").getBoundingClientRect();

	// update current location and instance locations
	// - TODO: this does not belong in the drawing function
	//[GLOBAL.current, ...GLOBAL.instances].forEach(location => instantiateLocation(location));

	// set up the grid locations
	const [xAxisId, yAxisId] = getVisibleAxisIds(viewEl);
	const [xAxis, yAxis] = [xAxisId, yAxisId].map(a => GLOBAL.font.fvar.axes[a]);

	const gridLocations = [];
	const graticuleStyle = Q("#grid-style").value;
	const xGraticules = getGraticulesForAxis(viewEl, xAxis, graticuleStyle);
	const yGraticules = getGraticulesForAxis(viewEl, yAxis, graticuleStyle);

	// draw a grid
	xGraticules.forEach(x => {
		yGraticules.forEach(y => {

			const gridLocation = [[],[]];
			GLOBAL.font.fvar.axes.forEach((axis, a) => {
				let val;
				if (axis === xAxis)
					val = x;
				else if (axis === yAxis)
					val = y;
				else
					val = GLOBAL.current[0][a];
				gridLocation[0][a] = gridLocation[1][a] = val;
			});
			gridLocations.push(gridLocation);
		});	
	});
	gridLocations.forEach(location => instantiateLocation(location));

	// draw a white rectangle to clear the SVG
	// Q(".mappings-visual g").append(SVG("rect", {x:0, y:0, width:rect.width, height:rect.height, fill: "white"})); // draw a white rectangle
	g.append(SVG("rect", {x:0, y:0, width:rect.width, height:rect.height, fill: "white"})); // draw a white rectangle

	// draw grid as colors
	// - the idea is to draw colors from location[1] in the positions of locations[0]
	if (Q("#show-colors").checked) {
		gridLocations.forEach((location, l) => {

			// get current visible axes
			// const [xAxisId, yAxisId] = getVisibleAxisIds(viewEl);
			// const [xAxis, yAxis] = [xAxisId, yAxisId].map(a => GLOBAL.font.fvar.axes[a]);
			let xRatio = 0, yRatio = 0;
			
			if (location[1][xAxisId] > xAxis.defaultValue)
				xRatio = (location[1][xAxisId] - xAxis.defaultValue) / (xAxis.maxValue - xAxis.defaultValue);
			else if (location[1][xAxisId] < visibleAxes[0].defaultValue)
				xRatio = (location[1][xAxisId] - xAxis.defaultValue) / (xAxis.minValue - xAxis.defaultValue);

			if (location[1][yAxisId] > yAxis.defaultValue)
				yRatio = (location[1][yAxisId] - yAxis.defaultValue) / (yAxis.maxValue - yAxis.defaultValue);
			else if (location[1][yAxisId] < yAxis.defaultValue)
				yRatio = (location[1][yAxisId] - yAxis.defaultValue) / (yAxis.minValue - yAxis.defaultValue);

			const hue = Math.atan2(yRatio, xRatio) * 180 / Math.PI * 2; // the *2 transforms [0,90] to [0,180], thus from one hue to its complement
			const saturation = Math.max(xRatio, yRatio);
			const lightness = 0.5;
			const hslValue = `hsl(${Math.round(hue)}deg ${Math.round(saturation*100)}% ${Math.round(lightness*100)}%)`;

			// convert coords to svg values
			const [svgX0, svgY0] = svgCoordsFromAxisCoords(rect, location[0]);
			const size = 40;
			const rectEl = SVG("rect", {x: svgX0-size/2, y: svgY0-size/2, width: size, height: size, fill: hslValue, stroke: "none"});

			// add rectEl to the SVG
			g.append(rectEl);
		});
	}

	// draw a grey border to mask out the colours that go over the edge
	const borderEl = SVG("path", {d: `M-10 -10H${rect.width+20}V${rect.height+20}H-10ZM0 0V${rect.height}H${rect.width}V0Z`, fill: "#eee", stroke: "none"});
	g.append(borderEl);


	// draw x-axis and y-axis
	const svgOriginCoords = svgCoordsFromAxisCoords(viewEl, getDefaultAxisCoords());

	const axesEl = SVG("path", {d: `M0,${svgOriginCoords[1]}H${rect.width}M${svgOriginCoords[0]},0V${rect.height}Z`, fill: "none", stroke: "black", "stroke-width": 2}); // draw the axes with 2 lines
	g.append(axesEl);

	// draw grid locations as a grid
	if (Q("#grid-style").value.startsWith("grid-")) {

		// build a single path element that draws all the grid lines
		let pathStr = "";

		// vertical lines
		for (let xn=0; xn < xGraticules.length; xn++)
			for (let yn=0, cmd="M"; yn < yGraticules.length; yn++, cmd="L")
				pathStr += cmd + svgCoordsFromAxisCoords(viewEl, gridLocations[xn * yGraticules.length + yn][1]).join();

		// horizontal lines
		for (let yn=0; yn < yGraticules.length; yn++)
			for (let xn=0, cmd="M"; xn < xGraticules.length; xn++, cmd="L")
				pathStr += cmd + svgCoordsFromAxisCoords(viewEl, gridLocations[xn * yGraticules.length + yn][1]).join();

		// add the path to the SVG
		const path = SVG("path", {d: pathStr, stroke: "#ccc", fill: "none"});
		g.append(path);
	}
	
	// draw grid locations as vectors
	else {
		gridLocations.forEach((location, l) => {
			const [svgX0, svgY0] = svgCoordsFromAxisCoords(viewEl, location[0]);
			const [svgX1, svgY1] = svgCoordsFromAxisCoords(viewEl, location[1]);

			// are the input and output equal in this projection? (need to allow for normalization rounding)
			if (!locationsAreEqual(location[0], location[1], [xAxisId, yAxisId])) {
				const arrow = svgArrow({x1: svgX0, y1: svgY0, x2: svgX1, y2: svgY1, tipLen: 7, tipWid: 7, strokeWidth: 1, color: "#bbb"}); // draw an arrow
				g.append(arrow);	
			}
			g.append(SVG("circle", {cx: svgX0, cy: svgY0, r: 2.5, fill: "#bbb"})); // draw a dot
		});
	}

	// draw grid as heat map?
	// TODO: the idea is to show which locations have moved the most

	// draw the instances (including current)
	// - draw them early so they are underneath the mappings and current location which need to be dragged
	GLOBAL.instances.forEach(location => {
		const [svgX0, svgY0] = svgCoordsFromAxisCoords(viewEl, location[0]);
		const [svgX1, svgY1] = svgCoordsFromAxisCoords(viewEl, location[1]);

		const elInstance0 = SVG("g"), elInstance1 = SVG("g");

		elInstance0.innerHTML = svgCurrentLocation;
		elInstance0.setPosition([svgX0, svgY0]);
		elInstance0.style.opacity = 0.9;
		elInstance0.style.color = instanceColor;
		
		elInstance1.innerHTML = svgCurrentLocation;
		elInstance1.setPosition([svgX1, svgY1]);
		elInstance1.style.opacity = 0.4;
		elInstance1.style.color = instanceColor;

		g.append(elInstance1, elInstance0);

		// are the input and output equal in this projection? (need to allow for normalization rounding)
		if (locationsAreEqual(location[0], location[1], [xAxisId, yAxisId])) {
			g.append(elInstance0);
		}
		else {
			g.append(elInstance1, elInstance0, svgArrow({x1: svgX0, y1: svgY0, x2: svgX1, y2: svgY1, tipLen: 7, tipWid: 7, strokeWidth: 1, color: instanceColor})); // add an arrow
		}
	});

	// draw the mappings
	GLOBAL.mappings.forEach((mapping, m) => {

		const elInput = SVG("g");
		const elOutput = SVG("g");
	
		elInput.classList.add("input", "location", "mapping");
		elOutput.classList.add("output", "location", "mapping");
	
		elInput.innerHTML = svgMappingHandle;
		elOutput.innerHTML = svgMappingHandle;
	
		elInput.onmousedown = mappingMouseDown;
		elOutput.onmousedown = mappingMouseDown;

		elInput.dataset.index = m;
		elOutput.dataset.index = m;

		const svgCoordsFrom = svgCoordsFromAxisCoords(viewEl, mapping[0]);
		const svgCoordsTo = svgCoordsFromAxisCoords(viewEl, mapping[1]);

		elInput.setPosition(svgCoordsFrom);
		elInput.style.opacity = 0.8;
		elOutput.setPosition(svgCoordsTo);
		elOutput.style.opacity = 0.4;

		// draw the arrow
		const arrowSvg = svgArrow({index: m, x1: svgCoordsFrom[0], y1: svgCoordsFrom[1], x2: svgCoordsTo[0], y2: svgCoordsTo[1], tipLen: 11, tipWid: 11, strokeWidth: 2});
		arrowSvg.classList.add("mapping");

		// add them all to the SVG element		
		g.append(arrowSvg, elOutput, elInput);
	});

	// display the current location (untransformed #0 and transformed #1)
	// - render #1 first since it may be underneath #0 (which needs mouse events)
	const elCurrent0 = SVG("g"), elCurrent1 = SVG("g");

	const svgCoordsFrom = svgCoordsFromAxisCoords(viewEl, GLOBAL.current[0]);
	const svgCoordsTo = svgCoordsFromAxisCoords(viewEl, GLOBAL.current[1]);

	elCurrent0.innerHTML = svgCurrentLocation;
	elCurrent0.setPosition(svgCoordsFrom);
	elCurrent0.style.opacity = 0.9;
	elCurrent0.classList.add("current", "location", "input"); // input class allows it to be handled by the mappings mouse handlers
	elCurrent0.style.color = "var(--currentLocationColor)";
	elCurrent0.dataset.index = -1;
	elCurrent0.onmousedown = mappingMouseDown; // only elCurrent0 gets a mouse handler

	elCurrent1.innerHTML = svgCurrentLocation;
	elCurrent1.setPosition(svgCoordsTo);
	elCurrent1.style.opacity = 0.4;
	elCurrent1.style.color = "var(--currentLocationColor)";

	// draw the current arrow
	const arrowSvg = svgArrow({index: -1, x1: svgCoordsFrom[0], y1: svgCoordsFrom[1], x2: svgCoordsTo[0], y2: svgCoordsTo[1], tipLen: 7, tipWid: 7, strokeWidth: 1, color: "var(--currentLocationColor)"});
	g.append(elCurrent1, elCurrent0, arrowSvg); // order is important, since we must be able to click on the [0] version if they overlap

	// draw the rulers
	const rulerX = viewEl.querySelector(".ruler.horizontal"), rulerY = viewEl.querySelector(".ruler.vertical");
	const rulerGraticulesX = getGraticulesForAxis(viewEl, xAxis, "ruler");
	const rulerGraticulesY = getGraticulesForAxis(viewEl, yAxis, "ruler");

	if (!rulerX.textContent) {
		rulerGraticulesX.forEach(x => {
			const label = EL("div", {style: `position: absolute; transform: rotate(-90deg); transform-origin: left; bottom: 0; left: ${svgCoordFromAxisCoord(viewEl, visibleAxes[0].axisId, x)}px`});
			label.textContent = x;
			rulerX.append(label);
		});
	}
	if (!rulerY.textContent) {
		rulerGraticulesY.forEach(y => {
			const label = EL("div", {style: `position: absolute; right: 0; bottom: ${svgCoordFromAxisCoord(viewEl, visibleAxes[1].axisId, y)-10}px`});
			label.textContent = y;
			rulerY.append(label);
		});
	}
}

// returns true or false, depending on whether the two user locations are equal
// - true if loc0 and loc1 are equal when simple-normalized
// - false if loc0 and loc1 are not equal when simple-normalized
// - axisIds is an optional array of axes to check (default is to check all axes)
// - loc0 and loc1 are arrays of equal length
function locationsAreEqual(loc0, loc1, axisIds) {
	if (loc0.length !== loc1.length)
		return false;

	if (!axisIds)
		axisIds = [...Array(loc0.length).keys()];

	let equal = true;
	for (let a=0; a<axisIds.length; a++) {
		const axisId = axisIds[a];
		if (simpleNormalize(GLOBAL.font.fvar.axes[axisId], loc0[axisId]) !== simpleNormalize(GLOBAL.font.fvar.axes[axisId], loc1[axisId])) {
			equal = false;
			break;
		}
	}
	return equal;
}


function mappingsChanged(mode) {

	// let’s make an Item Variation Store!
	// - we create the list of IVS regions from the input mappings
	// - we create the delta sets from the output mappings
	// - we create a single ItemVariationData to store all the delta sets, ignoring the possibility to split them into multiple IVDs
	// - we create the IVS from the regions and the IVD
	// - we create the DeltaSetIndexMap object (note that all entries will have "outer" index = 0, since we only have one IVD)
	// - we create an avar table from the compiled IVS and DeltaSetIndexMap
	// - we insert the avar table into the font

	// set up the avar table that will contain the IVS
	const axisCount = GLOBAL.font.fvar.axisCount;

	const avar = {
		axisCount: axisCount,
		axisSegmentMaps: undefined, // new Array(axisCount).fill([[-1,-1],[0,0],[1,1]]), // we don’t need to speciy identity mappings
		axisIndexMap: undefined,
		ivsBuffer: undefined,
	};

	// set up the ivs, with a single ivd (later we encode it and assign it to avar.ivsBuffer)
	const ivs = {
		format: 1,
		axisCount: axisCount,
		regions: [],
		ivds: [ { regionIds: [], deltaSets: [] } ],
	};

	// create axisOrder array, of the form ["A", "B", "C", ...], these are fake axis names, guaranteed unique
	const axisOrder = Array.from({ length: axisCount }, (_, i) => String.fromCharCode(65 + i));

	// TODO: report error if any mappings start at default location
	
	// set up the locations
	const locs = [ new Array(axisCount).fill(0) ]; // initilize locs with its first element having all zeros
	const normalizedMappings = [];
	GLOBAL.mappings.forEach(mapping => normalizedMappings.push(mappingSimpleNormalize (GLOBAL.font.fvar.axes, mapping)) );
	normalizedMappings.forEach(mapping => {	
		if (mapping[0].some(coord => coord !== 0)) { // ignore a mapping whose input is the default location
			const loc = {};
			mapping[0].forEach((coord, a) => loc[axisOrder[a]] = coord);
			locs.push(loc);	
		}
	});

	// // set up the grid locations
	// const visibleAxisIds = getVisibleAxisIds();
	// const visibleAxes = visibleAxisIds.map(a => GLOBAL.font.fvar.axes[a]);
	// const gridLocations = [];
	// const graticuleStyle = Q("#grid-style").value;
	// const xGraticules = getGraticulesForAxis(rect, visibleAxes[0], graticuleStyle);
	// const yGraticules = getGraticulesForAxis(rect, visibleAxes[1], graticuleStyle);

	// // draw a grid
	// xGraticules.forEach(x => {
	// 	yGraticules.forEach(y => {

	// 		const gridLocation = [[],[]];
	// 		GLOBAL.font.fvar.axes.forEach((axis, a) => {
	// 			let val;
	// 			if (axis === visibleAxes[0])
	// 				val = x;
	// 			else if (axis === visibleAxes[1])
	// 				val = y;
	// 			else
	// 				val = GLOBAL.current[0][a];
	// 			gridLocation[0][a] = gridLocation[1][a] = val;
	// 		});
	// 		gridLocations.push(gridLocation);
	// 	});	
	// });

	// if this remains undefined, we didn’t create an avar table
	let avarBuf;
	
	// are there any mappings? (locs.length==1 means no mappings)
	GLOBAL.ivs = null;
	if (locs.length > 1) {

		// Fontra method
		const fLocations = [{}]; // we need a null mapping (origin->origin) to help the solver
		const masterValues = [];
		masterValues.push(new Array(axisCount).fill(0));

		for (let nm=0; nm<normalizedMappings.length; nm++) {
			const normMapping = normalizedMappings[nm];

			// ignore mappings that start at the default
			if (normMapping[0].every(coord => coord === 0))
				break;

			// check this mapping’s from location was not already added, since solver cannot handle duplicates of from locations
			if (normalizedMappings.slice(0,nm).some(testmapping => JSON.stringify(normMapping[0]) === JSON.stringify(testmapping[0])))
				break;

			// for each mapping, create an array of locations in object form, so we can use the solver
			fLocations.push(normMapping[0].reduce((fLocation, coord, a) => {
				if (coord !== 0) fLocation[axisOrder[a]] = coord; // only assign non-zero values to fLocation
				return fLocation;
			} , {} ));

			// fLocations is now an array of objects, where each objects has entries for any non-zero axis values
			// - the first object is empty, as it is the default location
			// - subsequent objects are of the form { A: 0.5, B: 0.5, E: 1, G: -0.75 ...}

			// for each mapping, create an array that is the difference between the input and output locations, and push it to the masterValues array
			masterValues.push(normMapping[1].map((coord, a) => coord - normMapping[0][a])); // this evaluates mapping[1][a] - mapping[0][a] for each axis a
		}

		// create the Fontra-style variation model
		const fModel = new VariationModel(fLocations, axisOrder);

		// create the IVS regions from fModel.supports (a region is an array of tents, one tent per axis)
		fModel.supports
			.filter(support => Object.keys(support).length > 0)
			.forEach(support => ivs.regions.push(GLOBAL.font.fvar.axes.map((axis, a) => support.hasOwnProperty(axisOrder[a]) ? support[axisOrder[a]] : [0,0,0])));

		// set up the IVD
		// - initialize the single IVD to include all the regions (we can optimize it later)
		ivs.ivds[0].regionIds = ivs.regions.map((region, r) => r); // if there are 5 regions, regionIds = [0, 1, 2, 3, 4]

		// transpose the deltas array (ignoring the first row) and assign to the IVD
		const deltas = fModel.getDeltas(masterValues);
		for (let a=0; a<axisCount; a++) {
			const deltaSet = [];
			for (let d=1; d<deltas.length; d++) // skip the first row, which is the default location
				deltaSet.push(deltas[d][a]);
			ivs.ivds[0].deltaSets.push(deltaSetScale(deltaSet)); // convert [-1,1] to [-0x4000,0x4000]
		}

		// prepare the axisIndexMap
		const innerIndexBitCount = 16, entrySize = 2;
		avar.axisIndexMap = {
			format: 0,
			entryFormat: (innerIndexBitCount - 1) | ((entrySize -1) << 4), // resolves to 1 byte with value 31 (0x1F)
			indices: new Array(GLOBAL.font.fvar.axisCount).fill(0).map((v, i) => i), // create an array [0, 1, 2, 3, ... axisCount-1]
		};

		// prepare the IVS
		const ivsBufOversize = new SamsaBuffer(new ArrayBuffer(10000)); // TODO: find a better way to allocate memory
		const ivsLength = ivsBufOversize.encodeItemVariationStore(ivs);
		avar.ivsBuffer = new SamsaBuffer(ivsBufOversize.buffer, 0, ivsLength); // the ivsBuffer we use is a slice of ivsBufOversize

		// write new avar table
		avarBuf = GLOBAL.font.tableEncoders.avar(GLOBAL.font, avar);

		GLOBAL.ivs = ivs;
	
	}

	// create a new binary font
	if (avarBuf)
		GLOBAL.fontBuffer = exportFontWithTables(GLOBAL.font, { avar: avarBuf }); // we’re inserting an avar table with binary contents avarBuf
	else
		GLOBAL.fontBuffer = exportFontWithTables(GLOBAL.font, undefined, { avar: true }); // explicitly delete any avar table

	// connect the new font to the UI
	GLOBAL.familyName = "Fencer-" + Math.random().toString(36).substring(7);
	if (GLOBAL.fontFace)
		document.fonts.delete(GLOBAL.fontFace);
	GLOBAL.fontFace = new FontFace(GLOBAL.familyName, GLOBAL.fontBuffer.buffer);
	document.fonts.add(GLOBAL.fontFace);
	GLOBAL.fontFace.load().then(() => {
		Qall(".render").forEach( renderEl => renderEl.style.fontFamily = GLOBAL.familyName );
	});

	// Harfbuzz update
	loadHarfbuzzFont(GLOBAL.fontBuffer.buffer);

	// calculate the transformed locations of current and instances
	[GLOBAL.current, ...GLOBAL.instances].forEach(location => instantiateLocation(location));

	// DRAW ALL VIEWS!!
	Qall(".window.view").forEach(viewEl => drawView(viewEl));

	// update the output locations for the current axis, if it’s selected
	if (GLOBAL.draggingIndex === -1) {
		Qall(".axes .axis").forEach((axisEl, a) => {
			axisEl.querySelectorAll("input.output").forEach(el => el.value = GLOBAL.current[1][a]);
		});
		formatNumericControls(-1);
	}	

}

// this function should be inside where we create the surrounding view and svg elements, then it can take all that nice context
function svgMouseMove(e) {

	e.preventDefault();
	e.stopPropagation();
	if (!GLOBAL.dragging)
		return;

	const el = GLOBAL.dragging; // not e.target
	const viewEl = GLOBAL.draggingViewEl;
	const [xAxisId, yAxisId] = getVisibleAxisIds(viewEl);
	const [xAxis, yAxis] = [xAxisId, yAxisId].map(a => GLOBAL.font.fvar.axes[a]);
	const index = GLOBAL.draggingIndex;
	const rect =  viewEl.querySelector(".svg-container").getBoundingClientRect();

	const mousex = e.clientX;
	const mousey = rect.height - e.clientY;
	const x = mousex - rect.left;
	const y = mousey + rect.top;
	const svgX = x - GLOBAL.dragOffset[0];
	const svgY = y - GLOBAL.dragOffset[1];

	let xCoord = axisCoordFromSvgCoord(viewEl, xAxisId, svgX);
	let yCoord = axisCoordFromSvgCoord(viewEl, yAxisId, svgY);
	if (Q("#integer-snapping").checked) {
		xCoord = Math.round(xCoord);
		yCoord = Math.round(yCoord);
	}
	xCoord = clamp(xCoord, xAxis.minValue, xAxis.maxValue);
	yCoord = clamp(yCoord, yAxis.minValue, yAxis.maxValue);

	const ioId = +el.classList.contains("output"); // yields 0 for input, 1 for output
	const mapping = index === -1 ? GLOBAL.current : GLOBAL.mappings[GLOBAL.draggingIndex];
	mapping[ioId][xAxisId] = xCoord;
	mapping[ioId][yAxisId] = yCoord;

	updatePucks(viewEl, svgCoordsFromAxisCoords(viewEl, mapping[ioId])); // they were made visible in mousedown event

	mappingsChanged();
	updateMappingsSliders(index);
	updateMappingsXML();
	updateRenders();
}

// this function should be inside where we create the surrounding view and svg elements, then it can take all that nice context
function svgMouseUp(e) {
	e.stopPropagation();

	const viewEl = GLOBAL.draggingViewEl;
	viewEl.querySelectorAll(".ruler .puck").forEach(el => el.classList.add("hidden")); // hide pucks

	GLOBAL.dragging = undefined;
	GLOBAL.dragOffset = undefined;
	GLOBAL.draggingViewEl = undefined;

	// disable what we put in place when we started dragging
	document.onmousemove = null;
	document.onmouseup = null;
}

// this function should be inside where we create the surrounding view and svg elements, then it can take all that nice context
function mappingMouseDown (e) {

	const viewEl = e.target.closest(".window.view")
	GLOBAL.draggingViewEl = viewEl;

	// if we hit the line, propagate the event
	// - this works for icons for mapping location and current location
	const el = e.target.closest("g.location");
	if (!el) {
		return false;
	}

	// we hit a location
	e.preventDefault();
	e.stopPropagation();

	const rect =  e.target.closest(".svg-container").getBoundingClientRect();
	
	GLOBAL.draggingIndex = parseInt(el.dataset.index);

	const transform = el.getAttribute("transform");
	const coordsStr = transform.match(/translate\(([^)]+),\s*([^)]+)\)/); // parse float in JS, not regex
	const coords = [parseFloat(coordsStr[1]), parseFloat(coordsStr[2])];

	const mousex = e.clientX;
	const mousey = rect.height - e.clientY;

	let svgX = mousex - rect.left;
	let svgY = mousey + rect.top;

	const dx = svgX - coords[0];
	const dy = svgY - coords[1];

	GLOBAL.dragOffset = [dx, dy];
	GLOBAL.dragging = el;

	// refresh sliders with data from the relevant mapping (or current location, which has index == -1)
	Q("#mapping-selector").value = GLOBAL.draggingIndex;
	updateMappingsSliders(GLOBAL.draggingIndex);

	// display pucks on each ruler
	const visibleAxisIds = getVisibleAxisIds(viewEl);
	svgX -= dx;
	svgY -= dy;

	// show pucks
	viewEl.querySelectorAll(".ruler .puck").forEach(el => el.classList.remove("hidden"));
	const ioId = +el.classList.contains("output");
	const mapping = GLOBAL.draggingIndex === -1 ? GLOBAL.current : GLOBAL.mappings[GLOBAL.draggingIndex];
	updatePucks(viewEl, svgCoordsFromAxisCoords(viewEl, mapping[ioId]));

	// these need to be on the document, not on the mousedown element
	document.onmousemove = svgMouseMove;
	document.onmouseup = svgMouseUp; // maybe mouseup should be when overflows (outside of min/max) are snapped back to [min,max]
}

// update the position of the pucks on each ruler
// TODO: fix issue with puck positions (it changes with string length)
function updatePucks(viewEl, svgCoords) {
	const [svgX, svgY] = svgCoords;
	const visibleAxisIds = getVisibleAxisIds(viewEl);
	const rect = viewEl.querySelector(".svg-container").getBoundingClientRect();
	const hPuck = viewEl.querySelector(".ruler.horizontal .puck"), vPuck = viewEl.querySelector(".ruler.vertical .puck");
	const coords = [axisCoordFromSvgCoord(viewEl, visibleAxisIds[0], svgX), axisCoordFromSvgCoord(viewEl, visibleAxisIds[1], svgY)];
	hPuck.classList.remove("hidden");
	hPuck.textContent = Math.round(coords[0] * 100)/100;
	hPuck.style.left = `${svgX-20}px`
	vPuck.classList.remove("hidden");
	vPuck.textContent = Math.round(coords[1] * 100)/100;
	vPuck.style.bottom = `${svgY-8}px`
}

// return a sorted array of values that span the axis from min to max, and are base 10 friendly
function getGraticulesForAxis(viewEl, axis, graticuleSpec) {

	if (axis.maxValue - axis.minValue == 0)
		return [axis.maxValue];

	const graticules = new Set([axis.minValue, axis.defaultValue, axis.maxValue]); // init the set of graticules
	if (graticuleSpec === "powers-of-10") {
		let inc = Math.pow(10, Math.floor(Math.log10((axis.maxValue - axis.minValue) * 0.3))); // get a value for inc, which is a power of 10 (10 as the inc from 33 to 330, then it goes to 100)
		for (let v = axis.minValue; v < axis.maxValue; v+=inc) {
			const gridVal = Math.floor(v / inc) * inc;
			if (gridVal > axis.minValue)
				graticules.add(Math.floor(v / inc) * inc);
		}	
	}
	else if (graticuleSpec.match(/^(fill-space-|grid-)/)) {
		let inc = 20; // measured in svg px units
		let match;
		if (match = graticuleSpec.match(/^(fill-space-|grid-)(\d+)/)) // e.g. fill-space-20, fill-space-40
			inc = parseInt(match[2]);
		for (let val = svgCoordFromAxisCoord(viewEl, axis.axisId, axis.defaultValue) + inc; axisCoordFromSvgCoord(viewEl, axis.axisId, val) < axis.maxValue; val += inc) { // get the max side of the axis
			graticules.add(axisCoordFromSvgCoord(viewEl, axis.axisId, val));
		}
		for (let val = svgCoordFromAxisCoord(viewEl, axis.axisId, axis.defaultValue) - inc; axisCoordFromSvgCoord(viewEl, axis.axisId, val) > axis.minValue; val -= inc) { // get the min side of the axis
			graticules.add(axisCoordFromSvgCoord(viewEl, axis.axisId, val));
		}
	}

	return [...graticules].sort((a,b)=>a-b); // return an array of the set (i.e. a unique array)
}

function deltaSetScale (deltaSet, scale=0x4000, round=true) {
	// const scaledDeltaSet = [];
	// deltaSet.forEach((delta, d) => scaledDeltaSet[d] = round ? Math.round(delta * scale) : delta * scale );
	// return scaledDeltaSet;

	return round ? deltaSet.map(delta => Math.round(delta * scale)) : deltaSet.map(delta => delta * scale);
}

function uint8ArrayToBase64(uint8) {
	return btoa(uint8.reduce((acc, ch) => acc + String.fromCharCode(ch), ""));
}

function xmlChanged(e) {
	const xmlString = e.target.value;
	const mappings = [];
	const parser = new DOMParser();
	const xmlDoc = parser.parseFromString(xmlString, "text/xml");
	const errors = [];

	// reset errors
	Q(".mappings .errors").style.display = "none";
	Q(".mappings .errors").innerText = "";

	if (!xmlDoc || xmlDoc.querySelector("parsererror")) {
		errors.push("Could not parse document");
	}
	else {
		xmlDoc.querySelectorAll("mappings>mapping").forEach(mappingEl => {

			// initialize a new mapping at the default location for all axes, on input and output
			const mapping = [GLOBAL.font.fvar.axes.map(axis => axis.defaultValue), []];
			mapping[1].push(...mapping[0]);

			// set any non-default inputs, then set any non-default outputs
			["input", "output"].forEach((io, ioId) => {
				mappingEl.querySelectorAll(`${io}>dimension`).forEach(dimEl => {
					const axisName = dimEl.getAttribute("name");
					const axis = GLOBAL.font.fvar.axes.find(axis => axis.name === axisName);
					if (axisName && axis) {
						const value = parseFloat(dimEl.getAttribute("xvalue"));
						if (valueInAxisRange(value, axis)) {
							mapping[ioId][axis.axisId] = value;
						}
						else {
							errors.push(`${io} axis ${axisName} value ${value} is outside the range [${axis.minValue},${axis.maxValue}]`);
						}
					}
					else {
						errors.push(`${io} axis ${axisName} not found`);
					}
				});
			});
	
			// add the mapping
			mappings.push(mapping);
		});	
	}

	// any errors?
	if (errors.length) {
		Q(".mappings .errors").style.display = "block";
		Q(".mappings .errors").innerText = errors.join("<br>");
	}
	else {
		GLOBAL.draggingIndex = -1;
		GLOBAL.mappings.length = 0;
		GLOBAL.mappings.push(...mappings);
		mappingsChanged();
		updateMappingsSliders(GLOBAL.draggingIndex);
		updateRenders();
		mappingsSelectorPopulate(); // repopulate the Controls dropdown
	}
}

function updateMappingsXML() {

	const axisCount = GLOBAL.font.fvar.axisCount;

	// update XML
	let str = "<mappings>\n";
	GLOBAL.mappings.forEach(mapping => {
		str += `  <mapping>\n`;
		["input","output"].forEach((io, i) => {
			str += `    <${io}>\n`;
			mapping[i].forEach((x, a) => {
				const axis = GLOBAL.font.fvar.axes[a];
				if (x !== undefined && axis.defaultValue !== x) // TODO: probbaly we should compare the simpleNormalize() values, not the raw values
					str += `      <dimension name="${GLOBAL.font.fvar.axes[a].name}" xvalue="${x}"/>\n`;
			});
			str += `    </${io}>\n`;
		});
		str += `  </mapping>\n`;
	});

	str += "</mappings>";
	Q(".mappings .xml").value = str;

	// update HTML
	Q(".mappings .html").innerHTML = "";
	GLOBAL.mappings.forEach((mapping, m) => {

		const details = EL("details");
		let mappingStr = `<summary>${m}</summary>`;

		["input","output"].forEach((io, i) => {
			mappingStr += `<span class="material-symbols-outlined" style="font-size: 90%">${io === "input" ? "login" : "logout"}</span>`; // $io decision inserts appropriate icon Material Symbols Outlined (note that the "input" and "output" icons do not match, so are not used)
			mapping[i].forEach((x, a) => {
				const axis = GLOBAL.font.fvar.axes[a];
				if (x !== undefined && axis.defaultValue !== x)
					mappingStr += ` ${GLOBAL.font.fvar.axes[a].axisTag}=${x}`;
			});
			mappingStr += "<br>";
		});
		details.innerHTML = mappingStr;
		Q(".mappings .html").append(details);
	});

	// assume there are no XML errors
	Q(".window.mappings .errors").style.display = "none";

}


// function to take a normalized tuple (n values each the range [-1,1] and return a location (n values each in the range [min,max] of its axis)
function denormalizeTuple(tuple) {
	const denorm = [];
	tuple.forEach((coord, a) => {
		const axis = GLOBAL.font.fvar.axes[a];
		const min = axis.minValue, max = axis.maxValue, def = axis.defaultValue;
		if (coord===0)
			denorm[a] = def;
		else if (coord>0)
			denorm[a] = def + coord * (max - def);
		else
			denorm[a] = def + coord * (def - min);
	});

	return denorm;
}

// function to create a new SamsaBuffer containing a binary font from an existing SamsaFont, but where tables can be inserted and deleted
// - <font> is a SamsaFont object with a tableList property
// - <inserts> is an object with each key being a table tag, each value being the SamsaBuffer of the binary contents
// - <deletes> is an object with each key being a table tag (value is ignored)
function exportFontWithTables(font, inserts={}, deletes={}) {

	function paddedLength(length) {
		return length + (4 - length%4) % 4
	}

	function u32FromTag(tag) {
		return [...tag].reduce((acc, curr) => (acc << 8) + curr.charCodeAt(0), 0);
	}

	const newTables = font.tableList
						.map(table => { return { tag: table.tag, tagU32: u32FromTag(table.tag), checkSum: 0, offset: 0, length: table.length, buffer: table.buffer } } )
						.filter(table => !deletes[table.tag] && !inserts[table.tag]);

	Object.keys(inserts).forEach(tag => newTables.push({ tag: tag, tagU32: u32FromTag(tag), checkSum: 0, offset: 0, length: inserts[tag].byteLength, buffer: inserts[tag] }));
	const newFontSize = 12 + 16 * newTables.length + newTables.reduce((acc, table) => acc + paddedLength(table.length), 0);
	const newFontBuf = new SamsaBuffer(new ArrayBuffer(newFontSize)); // allocate memory for the new font

	// write tables
	newFontBuf.seek(12 + newTables.length * 16); // skip the table directory
	newTables.forEach(table => newFontBuf.memcpy(table.buffer, table.offset = newFontBuf.tell(), undefined, undefined, 4));
	console.assert(newFontBuf.tell() === newFontSize, `The new font size (${newFontBuf.tell()}) and expected size (${newFontSize}) do not match.`);

	// write first 12 bytes and table directory
	newFontBuf.seek(0);
	newFontBuf.u32 = font.header.sfntVersion;
	newFontBuf.u16_array = [newTables.length, ...font.binarySearchParams(newTables.length)]; // 1+3 U16 values
	newTables
		.sort((a,b) => a.tagU32 - b.tagU32 ) // sort by tag
		.forEach(table => newFontBuf.u32_array = [table.tagU32, table.checkSum, table.offset, table.length]); // write 4 U32 values for each table
	newFontBuf.seek(0);
	return newFontBuf;
}

function formatNumericControls(m) {
	Qall(".axes .axis").forEach((axisEl, a) => {
		const axis = GLOBAL.font.fvar.axes[a];
		const inputNumericEl = axisEl.querySelector(".input.numeric");
		const outputNumericEl = axisEl.querySelector(".output.numeric");
		const inputVal = (m === -1) ? GLOBAL.current[0][a] : GLOBAL.mappings[m][0][a];
		const outputVal = (m === -1) ? GLOBAL.current[1][a] : GLOBAL.mappings[m][1][a];

		if (simpleNormalize(axis, inputVal) === 0)
			inputNumericEl.classList.add("default");
		else
			inputNumericEl.classList.remove("default");

		if (simpleNormalize(axis, outputVal) === 0)
			outputNumericEl.classList.add("default");
		else
			outputNumericEl.classList.remove("default");
	});
}

// update sliders for mapping m (use m=-1 for current location)
function updateMappingsSliders(m) {

	Qall(".axes .axis").forEach((axisEl, a) => {
		const axis = GLOBAL.font.fvar.axes[a];
		const inputSliderEl = axisEl.querySelector(".input.slider");
		const inputNumericEl = axisEl.querySelector(".input.numeric");
		const outputSliderEl = axisEl.querySelector(".output.slider");
		const outputNumericEl = axisEl.querySelector(".output.numeric");

		const inputVal = (m === -1) ? GLOBAL.current[0][a] : GLOBAL.mappings[m][0][a];
		const outputVal = (m === -1) ? GLOBAL.current[1][a] : GLOBAL.mappings[m][1][a];

		inputSliderEl.value = inputNumericEl.value = inputVal;
		outputSliderEl.value = outputNumericEl.value = outputVal;
	});

	formatNumericControls(m);

	// select the correct item in the mappings dropdown
	Q("#mapping-selector").value = m;

	if (GLOBAL.draggingIndex === -1) {
		Qall(".axes .axis input.output").forEach(el => el.disabled = true); // disable all the output elements
	}
	else {
		Qall(".axes .axis input.output").forEach(el => el.disabled = false); // enable all the output elements
	}
}

function updateSVGTransform(viewEl) {

	// fix the transform
	if (!viewEl) viewEl = Q(".window.view");

	viewEl.querySelector(".mappings-visual>g").attr({
		transform: `scale(1 -1) translate(10 -${viewEl.querySelector(".svg-container").getBoundingClientRect().height + 10})`,
	});

	// draw the rulers
	const visibleAxisIds = getVisibleAxisIds(viewEl);
	const visibleAxes = visibleAxisIds.map(a => GLOBAL.font.fvar.axes[a]);
	const rulerX = viewEl.querySelector(".ruler.horizontal"), rulerY = viewEl.querySelector(".ruler.vertical");
	const rulerGraticulesX = getGraticulesForAxis(viewEl, visibleAxes[0], "ruler");
	const rulerGraticulesY = getGraticulesForAxis(viewEl, visibleAxes[1], "ruler");

	// update the axis graticules
	viewEl.querySelectorAll(".graticule").forEach(el => el.remove());
	// Qall(".graticule").forEach(el => el.remove());
	rulerGraticulesX.forEach(x => {
		const label = EL("div", {class: "graticule", style: `left: ${svgCoordFromAxisCoord(viewEl, visibleAxisIds[0], x)}px`});
		label.textContent = x;
		rulerX.append(label);
	});
	rulerGraticulesY.forEach(y => {
		const label = EL("div", {class: "graticule", style: `bottom: ${svgCoordFromAxisCoord(viewEl, visibleAxisIds[1], y)-8}px`});
		label.textContent = y;
		rulerY.append(label);
	});
}


function selectAxisControls(e) {

	mappingsSelectorPopulate();
}


function windowGiveInteractivity(windowEl) {

	function saveWindowProperties() {
		// save window states in local storage (position has changed for this window, classes may have changed for other windows)
		// - TODO: add z-index to the stored properties for all windows when we implement it in UI
		Qall(".window").forEach(el => {
			let name = el.querySelector(":scope > h2").textContent.split(" ")[0]; // use the first word of the window title (we don’t want to store separate window properties for each view)
			const propString = JSON.stringify({left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height, classes: [...el.classList]});
			localStorage.setItem(`fencer:window[${name}]`, propString);
		});
	}
						
	let isDragging = false;
	let isResizing = false;
	let initialMouseX, initialMouseY, initialWindowX, initialWindowY, initialWindowWidth, initialWindowHeight;
	const titleBar = windowEl.querySelector(":scope > h2");
	const name = titleBar.textContent;

	// retrieve initial window rect from localStorage
	const windowProps = JSON.parse(localStorage.getItem(`fencer:window[${name.startsWith("View") ? "View" : name}]`));

	// is it an additional view window?
	if (name.startsWith("View") && Qall(".window.view").length > 1) {
		const style = Qall(".window.view")[Qall(".window.view").length - 2].style; // get the style of the most recently added view window
		windowEl.style.left = (parseFloat(style.left) + 20) + "px";
		windowEl.style.top = (parseFloat(style.top) + 20) + "px";
		windowEl.style.width = style.width;
		windowEl.style.height = style.height;
	}
	else if (windowProps) {
		if (windowProps.left) windowEl.style.left = windowProps.left;
		if (windowProps.top) windowEl.style.top = windowProps.top;
		if (windowProps.width) windowEl.style.width = windowProps.width;
		if (windowProps.height) windowEl.style.height = windowProps.height; // this is sometimes not set, i.e. auto, which is fine
		if (windowProps.classes) {
			windowProps.classes.forEach(className => windowEl.classList.add(className));
		}
	}

	if (titleBar) {
		windowEl.querySelector(":scope > h2").onmousedown = e => {
			e.preventDefault();
			const windowEl = e.target.closest(".window");

			// setup
			isDragging = true;
			initialMouseX = e.clientX;
			initialMouseY = e.clientY;
			initialWindowX = windowEl.offsetLeft;
			initialWindowY = windowEl.offsetTop;

			// dragging
			document.onmousemove = e => {
				e.preventDefault();
				if (!isDragging) return;
				const dx = e.clientX - initialMouseX;
				const dy = e.clientY - initialMouseY;
				windowEl.style.left = initialWindowX + dx + "px";
				windowEl.style.top = initialWindowY + dy + "px";
			};

			// ending drag
			document.onmouseup = e => {
				isDragging = false;
				document.onmousemove = null;
				document.onmouseup = null;
				saveWindowProperties(); // store new position in local storage
			};

			// window title typography and z-index
			// TODO: preserve order of windows below the selected one
			Qall(".window").forEach(el => {
				if (el === windowEl)
					el.classList.add("selected", "top");
				else
					el.classList.remove("selected", "top");
			});	
		};
	}

	const resizeHandle = windowEl.querySelector(":scope > .resize");
	if (resizeHandle) {
		resizeHandle.onmousedown = e => {
			e.preventDefault();
			isResizing = true;
			initialMouseX = e.clientX;
			initialMouseY = e.clientY;
			initialWindowWidth = windowEl.offsetWidth;
			initialWindowHeight = windowEl.offsetHeight;

			// resizing
			document.onmousemove = e => {
				e.preventDefault();
				if (!isResizing) return;
				const dx = e.clientX - initialMouseX;
				const dy = e.clientY - initialMouseY;
				if (!resizeHandle.classList.contains("no-horizontal"))
					windowEl.style.width = initialWindowWidth + dx + 'px';
				if (!resizeHandle.classList.contains("no-vertical"))
					windowEl.style.height = initialWindowHeight + dy + 'px';

				if (windowEl.classList.contains("view")) {
					mappingsChanged(); // update the SVG, yay!
					updateSVGTransform(windowEl);
				}
			};

			// ending resize
			document.onmouseup = e => {
				isResizing = false;
				document.onmousemove = null;
				document.onmouseup = null;
				saveWindowProperties(); // store new position in local storage
			};
		};
	}

	const closeButton = windowEl.querySelector(":scope > .close");
	if (closeButton) {
		closeButton.onclick = e => closeButton.closest(".window").remove();
		closeButton.textContent = "close";
	}
}


function initFencer() {

	const fontinfo = Q(".fontinfo");
	fontinfo.addEventListener("dragover", e => e.preventDefault() ); // prevent default to allow drop
	fontinfo.addEventListener("drop", onDropFont);

	// init the svg
	GLOBAL.svgEl = SVG("svg", {class: "mappings-visual"});
	GLOBAL.svgEl.append(SVG("g")); // this <g> element has all the content and has a transform
	
	Q("#mapping-selector").onchange = selectAxisControls;

	// delete the window created by the html
	// TODO: remove the HTML and this code
	Q(".window.mappings-ui").remove();

	Q("#sample-text").oninput = sampleTextChange; // handle change of sample text
	Q("#mapping-selector").onchange = selectMapping; // handle change of mappings selector
	Q("#grid-style").onchange = e => {
		localStorage.setItem("fencer:gridStyle", e.target.value);
		mappingsChanged();
	};
	Q("#add-render").onclick = addRender;
	Q("#download-font").onclick = downloadFont;
	Q("#show-colors").onchange = mappingsChanged;

	Q(".window.mappings .xml").oninput = xmlChanged;

	// adjust XML font size
	Qall(".window.mappings .zoom").forEach(zoomEl => {
		zoomEl.onclick = e => {
			const scale = e.target.classList.contains("in") ? 6/5 : 5/6;
			const cs = getComputedStyle(Q(".window.mappings .xml"));
			Q(".window.mappings .xml").style.fontSize = (parseFloat(cs.fontSize) * scale) + "px";
		};
	});

	// show/hide XML
	Q("button#toggle-xml").onclick = e => {
		Q(".mappings .html").classList.toggle("hidden");
		Q(".mappings .xml").classList.toggle("hidden");
	};

	// save XML
	Q("button#save-xml").onclick = e => {
		const fauxLink = EL("a");
		fauxLink.download = "fencer.xml";
		fauxLink.href = "data:application/xml;charset=UTF-8," + encodeURIComponent(Q(".mappings .xml").value);
		document.body.append(fauxLink); // needed for Firefox, not Chrome or Safari
		fauxLink.click();
		fauxLink.remove();
	};

	// load initial font
	const filename = "SofiaSans-VF.ttf"; // or "RobotoA2-avar2-VF.ttf";
	const filepath = "../fonts/" + filename;
	fetch(filepath)
		.then(response => response.arrayBuffer())
		.then(arrayBuffer => {
			loadFontFromArrayBuffer(arrayBuffer, {filename: filename});
		});

	// set grid-style selector to value stored in localStorage
	const gridStyle = localStorage.getItem(`fencer:gridStyle`);
	if (gridStyle) Q("#grid-style").value = gridStyle;

	// set up the windowing system
	Qall(".window").forEach(windowEl => {

		windowGiveInteractivity(windowEl);

	});

	// populate renderers dropdown
	for (const [key, value] of Object.entries(GLOBAL.renderers)) {
		const option = EL("option", { id: key });
		option.textContent = value;
		Q("#renderer").append(option);
	}
	Q("#renderer").onchange = updateRenders;
	
	// render test div to see if avar2 is active
	const avar2TestFontPath = "../fonts/avar2checkerVF-working.ttf";
	fetch(avar2TestFontPath)
		.then(response => response.arrayBuffer())
		.then(arrayBuffer => {
			// load the font and attach it to the document
			const fontFace = new FontFace("avar2-checker", arrayBuffer);
			document.fonts.add(fontFace);
			document.fonts.ready.then(() => {

				// prepare the test div
				const testDiv = EL("div");
				testDiv.style.fontFamily = "avar2-checker";
				testDiv.style.fontSize = "100px";
				testDiv.style.display = "inline-block";
				testDiv.textContent = "B"; // the B glyph varies in width with avar2
				Q(".window-canvas").append(testDiv); // add the test div to the document

				// perform tests on the div and store results
				testDiv.style.fontVariationSettings = "'AVAR' 0";
				window.requestAnimationFrame(() => { // ensures the browser has had a chance to render the content in the div
					const width0 = testDiv.getBoundingClientRect().width;
					testDiv.style.fontVariationSettings = "'AVAR' 100";
					window.requestAnimationFrame(() => { // ensures the browser has had a chance to render the content in the div
						const width100 = testDiv.getBoundingClientRect().width;		
						GLOBAL.avar2Active = (width100 > width0); // assign the global
						testDiv.remove(); // clean up: remove the test div
		
						// switch to harfbuzz if avar2 is unsupported by this browser
						if (!GLOBAL.avar2Active) {
							Q("#renderer").value = "harfbuzz";
							Q("#renderer").dispatchEvent(new Event("change"));
						}
					});	
				});
			});
		});


}


function downloadFont() {

	if (!GLOBAL.fontBuffer) {
		return;
	}

	const uint8 = new Uint8Array(GLOBAL.fontBuffer.buffer);
	const fauxLink = EL("a");
	fauxLink.download = "fencer.ttf";
	fauxLink.href = "data:font/ttf;base64," + uint8ArrayToBase64(uint8);
	document.body.append(fauxLink); // needed for Firefox, not Chrome or Safari
	fauxLink.click();
	fauxLink.remove();
}

function updateRenders() {

	const renderer = Q("#renderer").value;
	const renderText = Q("#sample-text").value;

	
	if (!["harfbuzz", "browser"].includes(renderer)) {
		alert ("Coming soon");
		return;
	}


	// update all renders
	Qall(".render-item").forEach((renderItemEl, r) => {
		const renderEl = renderItemEl.querySelector(".render");
		const fvsEntries = [];
		const fvs = {};

		if (r===0) {
			GLOBAL.font.fvar.axes.forEach((axis, a) => {
				fvsEntries.push(`"${axis.axisTag}" ${GLOBAL.current[0][a]}`);
				fvs[axis.axisTag] = GLOBAL.current[0][a];
			});
		}
		else {
			const axisEls = [...renderItemEl.querySelectorAll(".axis")];
			GLOBAL.font.fvar.axes.forEach((axis, a) => {
				const axisEl = axisEls[a];
				const valueEl = axisEl.querySelector(".value");
				if (!axisEl.classList.contains("locked")) {
					valueEl.value = GLOBAL.current[0][a];
				}
				fvsEntries.push(`"${axis.axisTag}" ${valueEl.value}`);
				fvs[axis.axisTag] = valueEl.value;
			});
		}

		if (renderer === "browser") {

			// browser method
			renderEl.innerHTML = renderText;
			renderEl.style.fontSize = `${GLOBAL.renderFontSize}px`;
			renderEl.style.fontVariationSettings = fvsEntries.join();
			renderEl.style.color = "blue";
		}

		else if (renderer === "harfbuzz") {

			// Harfbuzz method
			if (GLOBAL.hb && GLOBAL.hbFont) {

				renderEl.innerHTML = "";

				const font = GLOBAL.hbFont;
				const hb = GLOBAL.hb;
				const fontSize = GLOBAL.renderFontSize;
				const upem = GLOBAL.font.head.unitsPerEm;
				const scale = fontSize/upem;
				const gPreamble = `<g transform="scale(${scale} ${-scale}),translate(0 ${-upem})" fill="green">`;
				const gPostamble = "</g>";

				font.setVariations(fvs);
			
				const buffer = hb.createBuffer();
				if (!buffer) {
					console.log("could not create hb buffer")
				}
				buffer.addText(renderText);
				buffer.guessSegmentProperties();
				hb.shape(font, buffer);
				const result = buffer.json(font);
				buffer.destroy();
			
				const paths = {}; // indexed by glyphId (use object not array, because this may be very sparse)
				let x = 0;
				let svg = "";
				result.forEach(item => {
					const path = paths[item.g] || (paths[item.g] = font.glyphToPath(item.g));
					svg += `<g transform="translate(${x},0)"><path d="${path}"/></g>`;
					x += item.ax;
				});
				const svgHbEl = SVG("svg", {class: "harfbuzz"});
				svgHbEl.attr({width: 10000, height: 10000})
				svgHbEl.innerHTML = gPreamble + svg + gPostamble;
			
				renderEl.append(svgHbEl);
			}
		}

	});
}


function selectMapping(e) {

	GLOBAL.draggingIndex = parseInt(e.target.value);
	updateMappingsSliders(GLOBAL.draggingIndex);

}


// loadHarfbuzzFont function
function loadHarfbuzzFont(arrayBuffer) {

	const hb = GLOBAL.hb;
	
	if (GLOBAL.hbFont) GLOBAL.hbFont.destroy();
	if (GLOBAL.hbFace) GLOBAL.hbFace.destroy();
	if (GLOBAL.hbBlob) GLOBAL.hbBlob.destroy();

	GLOBAL.hbBlob = hb.createBlob(new Uint8Array(arrayBuffer));
	GLOBAL.hbFace = hb.createFace(GLOBAL.hbBlob, 0);
	GLOBAL.hbFont = hb.createFont(GLOBAL.hbFace);
}


// load Harfbuzz wasm, them init Fencer
WebAssembly.instantiateStreaming(fetch("./harfbuzz/hb.wasm")).then(result => {
	GLOBAL.hb = hbjs(result.instance);
	initFencer(); // main Fencer init stuff
});
