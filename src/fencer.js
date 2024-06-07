"use strict"

import { SamsaFont, SamsaInstance, SamsaBuffer } from "./samsa-core/samsa-core.js"; // import samsa-core https://github.com/Lorp/samsa-core
import { VariationModel } from "./fontra-src-client-core/var-model.js"; // import Fontra var-model https://github.com/googlefonts/fontra

const svgArrowHandleRadius = 12;
const svgCurrentLocationRadius = 7;
const svgArrowLineWidth = 2;
const svgMappingHandle = `<circle cx="0" cy="0" r="${svgArrowHandleRadius}" fill="currentColor" stroke="none"/>`;
const svgCurrentLocation = `<circle cx="0" cy="0" r="${svgCurrentLocationRadius+svgArrowLineWidth}" fill="white" stroke="none"/><circle cx="0" cy="0" r="${svgCurrentLocationRadius}" fill="currentColor" stroke="none"/>`;
const instanceColor = "#f00";

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

function axisCoordFromSvgCoord (a, val) {
	const visibleAxisIds = getVisibleAxisIds();
	const axis = GLOBAL.font.fvar.axes[a];
	const rect =  Q(".svg-container").getBoundingClientRect();
	const length = parseFloat((visibleAxisIds[0] === a) ? rect.width : rect.height);
	return val / length * (axis.maxValue - axis.minValue) + axis.minValue;
}

function svgCoordFromAxisCoord (a, val) {
	const visibleAxisIds = getVisibleAxisIds();
	const axis = GLOBAL.font.fvar.axes[a];
	const rect =  Q(".svg-container").getBoundingClientRect();
	const length = parseFloat((visibleAxisIds[0] === a) ? rect.width : rect.height);
	return Math.round((val - axis.minValue) / (axis.maxValue - axis.minValue) * length * 1000) / 1000; // round to nearest 0.001 (avoids tiny rounding errors that bloat SVG)
}

function svgCoordsFromAxisCoords (coords) {

	const [a0, a1] = GLOBAL.mappingsView;
	const s0 = svgCoordFromAxisCoord(a0, coords[a0]);
	const s1 = svgCoordFromAxisCoord(a1, coords[a1]);
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

	GLOBAL.fontFace = new FontFace(GLOBAL.font.names[6], arrayBuffer);
	GLOBAL.fontFace.load().then(loadedFace => {

		document.fonts.add(loadedFace);
		const renderEls = Qall(".render");

		// locked axes are stored in dataset
		renderEls.forEach(renderEl => {
			renderEl.style.fontFamily = GLOBAL.font.names[6];
		});

		// activate buttons
		Q("#download-font").disabled = false;
		Q("#add-mapping").disabled = false;
		Q("#delete-mapping").disabled = false;

		// on add/delete mapping button click
		Q("#add-mapping").onclick = addMapping;
		Q("#delete-mapping").onclick = deleteMapping;

		// init the mappings xml
		updateMappingsXML();
	});

	mappingsSelectorPopulate();

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

		const inputOrOutput = e.target.classList.contains("input") ? "input" : "output";
		const inputOrOutputId = (inputOrOutput === "input") ? 0 : 1;
		const el = e.target;
		const axisEl = el.closest(".axis");
		const axisId = parseInt(axisEl.dataset.axisId);
		const axis = GLOBAL.font.fvar.axes[axisId];
		let val = parseFloat(el.value);
		if (el.classList.contains("slider") && Q("#integer-snapping").checked && ![axis.minValue, axis.maxValue].includes(val)) {
			val = Math.round(val);
			el.value = val;
		}
		const otherInputEl = el.classList.contains("slider") ? axisEl.querySelector(`.${inputOrOutput}.numeric`) : axisEl.querySelector(`.${inputOrOutput}.slider`);
		otherInputEl.value = val;

		// move the marker
		if (GLOBAL.draggingIndex === -1) {
			GLOBAL.current[0][axisId] = parseFloat(el.value);
		}
		else {
			GLOBAL.mappings[GLOBAL.draggingIndex][inputOrOutputId][axisId] = parseFloat(el.value);
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
		const inputOrOutputId = +e.shiftKey; // 0 for input, 1 for output

		// is this the "reset all" button in the key row?
		if (parentEl.classList.contains("key")) {

			if (GLOBAL.draggingIndex === -1) {
				GLOBAL.current[0] = getDefaultAxisCoords(); // don’t reset GLOBAL.current[1] directly
			}
			else {
				GLOBAL.mappings[GLOBAL.draggingIndex][inputOrOutputId] = getDefaultAxisCoords();
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
				GLOBAL.mappings[GLOBAL.draggingIndex][inputOrOutputId][axisId] = axis.defaultValue;
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
		// - TODO: make this work for single-axis fonts
		if (xSelected && ySelected && (xSelected === ySelected)) {
			const axisEls = Qall(".axes .axis");
			for (let a=0; a<axisEls.length; a++) {
				const axisEl = axisEls[a];
				if (!axisEl.querySelector(`input[name=${orientationNotChosen}]`).checked) {
					axisEl.querySelector(`input[name=${orientationNotChosen}]`).checked = true;
					// mappingsView[1] = a;
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


		// redraw the mappings SVG
		// - TODO: decide if we need to update the mappingsView array
		mappingsChanged();

		// fix the rulers
		updateSVGTransform();
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
	updateSVGTransform();
	mappingsChanged(0);
	updateRenders();
	
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

	return GLOBAL.font.fvar.axes.map((axis, a) => axis.defaultValue );
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

function getVisibleAxisIds() {
	const xAxisEl = Q("input[name=x-axis]:checked").closest(".axis");
	const yAxisEl = Q("input[name=y-axis]:checked").closest(".axis");
	const xAxisIndex = parseInt(xAxisEl.dataset.axisId);
	const yAxisIndex = parseInt(yAxisEl.dataset.axisId);
	return [xAxisIndex, yAxisIndex];
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

	// set up the grid locations
	const visibleAxisIds = getVisibleAxisIds();
	const visibleAxes = visibleAxisIds.map(a => GLOBAL.font.fvar.axes[a]);
	const gridLocations = [];
	const graticuleStyle = Q("#grid-style").value;
	const xGraticules = getGraticulesForAxis(visibleAxes[0], graticuleStyle);
	const yGraticules = getGraticulesForAxis(visibleAxes[1], graticuleStyle);

	// draw a grid
	xGraticules.forEach(x => {
		yGraticules.forEach(y => {

			const gridLocation = [[],[]];
			GLOBAL.font.fvar.axes.forEach((axis, a) => {
				let val;
				if (axis === visibleAxes[0])
					val = x;
				else if (axis === visibleAxes[1])
					val = y;
				else
					val = GLOBAL.current[0][a];
				gridLocation[0][a] = gridLocation[1][a] = val;
			});
			gridLocations.push(gridLocation);
		});	
	});

	//
	let avarBuf; // if this remains undefined, we didn’t create an avar table
	
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

	// create a new SamsaFont from the binary font, so that we can create instances and detemine transformed tuples
	const sf = new SamsaFont(GLOBAL.fontBuffer);

	// connect the new font to the UI
	GLOBAL.familyName = "Fencer-" + Math.random().toString(36).substring(7);
	if (GLOBAL.fontFace)
		document.fonts.delete(GLOBAL.fontFace);
	GLOBAL.fontFace = new FontFace(GLOBAL.familyName, GLOBAL.fontBuffer.buffer);
	document.fonts.add(GLOBAL.fontFace);
	GLOBAL.fontFace.load().then(() => {
		Qall(".render").forEach( renderEl => renderEl.style.fontFamily = GLOBAL.familyName );
	});

	// update the location[1] values for a given array of location[0] values
	function instantiateLocation(sf, location) {
		// find the transformed axis locations, by creating a SamsaInstance
		// const axisSettings = {};
		// GLOBAL.font.fvar.axes.forEach((axis, a) => axisSettings[axis.axisTag] = location[0][a]); // untransformed
		// const si = new SamsaInstance(sf, axisSettings); // si.tuple is the transformed normalized tuple
		// location[1] = denormalizeTuple(si.tuple); // transformed and denormalized tuple

		// find the transformed axis locations, without creating a SamsaInstance
		const normalizedLocation = location[0].map((coord, a) => simpleNormalize(GLOBAL.font.fvar.axes[a], coord));
		if (GLOBAL.ivs) {
			const deltas = SamsaFont.prototype.itemVariationStoreInstantiate(GLOBAL.ivs, normalizedLocation);
			location[1] = denormalizeTuple(normalizedLocation.map((coord, a) => coord + deltas[0][a]/0x4000));
		}
		else {
			location[0].forEach((val, i) => location[1][i] = val); // alternative to location[1] = location[0] without reassigning array
		}
	}

	// create an instance for each location, in order to gets its normalized tuple
	const locations = [GLOBAL.current, ...GLOBAL.instances];
	[...locations, ...gridLocations].forEach(location => instantiateLocation(sf, location));

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

	// ok start redrawing the SVG
	Q("#mappings-visual g").innerHTML = "";

	// get base rectangle
	const rect =  Q(".svg-container").getBoundingClientRect();

	// draw a white rectangle to clear the SVG
	Q("#mappings-visual g").append(SVG("rect", {x:0, y:0, width:rect.width, height:rect.height, fill: "white"})); // draw a white rectangle

	// draw x-axis and y-axis
	const svgOriginCoords = svgCoordsFromAxisCoords(getDefaultAxisCoords());

	const axesEl = SVG("path", {d: `M0,${svgOriginCoords[1]}H${rect.width}M${svgOriginCoords[0]},0V${rect.height}Z`, fill: "none", stroke: "black", "stroke-width": 2}); // draw the axes with 2 lines
	Q("#mappings-visual g").append(axesEl);

	// draw grid locations as a grid
	if (Q("#grid-style").value.startsWith("grid-")) {

		// build a single path element that draws all the grid lines
		let pathStr = "";

		// vertical lines
		for (let xn=0; xn < xGraticules.length; xn++)
			for (let yn=0, cmd="M"; yn < yGraticules.length; yn++, cmd="L")
				pathStr += cmd + svgCoordsFromAxisCoords(gridLocations[xn * yGraticules.length + yn][1]).join();

		// horizontal lines
		for (let yn=0; yn < yGraticules.length; yn++)
			for (let xn=0, cmd="M"; xn < xGraticules.length; xn++, cmd="L")
				pathStr += cmd + svgCoordsFromAxisCoords(gridLocations[xn * yGraticules.length + yn][1]).join();

		// add the path to the SVG
		const path = SVG("path", {d: pathStr, stroke: "#ccc", fill: "none"});
		Q("#mappings-visual g").append(path);
	}
	
	// draw grid locations as vectors
	else {
		gridLocations.forEach((location, l) => {
			const [svgX0, svgY0] = svgCoordsFromAxisCoords(location[0]);
			const [svgX1, svgY1] = svgCoordsFromAxisCoords(location[1]);

			// are the input and output equal in this projection? (need to allow for normalization rounding)
			if (!locationsAreEqual(location[0], location[1], visibleAxisIds)) {
				const arrow = svgArrow({x1: svgX0, y1: svgY0, x2: svgX1, y2: svgY1, tipLen: 7, tipWid: 7, strokeWidth: 1, color: "#bbb"}); // draw an arrow
				Q("#mappings-visual g").append(arrow);	
			}
			Q("#mappings-visual g").append(SVG("circle", {cx: svgX0, cy: svgY0, r: 2.5, fill: "#bbb"})); // draw a dot
		});
	}

	// draw the instances (including current)
	// - draw them early so they are underneath the mappings and current location which need to be dragged
	GLOBAL.instances.forEach(location => {
		const [svgX0, svgY0] = svgCoordsFromAxisCoords(location[0]);
		const [svgX1, svgY1] = svgCoordsFromAxisCoords(location[1]);

		const elInstance0 = SVG("g"), elInstance1 = SVG("g");

		elInstance0.innerHTML = svgCurrentLocation;
		elInstance0.setPosition([svgX0, svgY0]);
		elInstance0.style.opacity = 0.9;
		elInstance0.style.color = instanceColor;
		
		elInstance1.innerHTML = svgCurrentLocation;
		elInstance1.setPosition([svgX1, svgY1]);
		elInstance1.style.opacity = 0.4;
		elInstance1.style.color = instanceColor;

		Q("#mappings-visual g").append(elInstance1, elInstance0);

		// are the input and output equal in this projection? (need to allow for normalization rounding)
		if (locationsAreEqual(location[0], location[1], visibleAxisIds)) {
			Q("#mappings-visual g").append(elInstance0);
		}
		else {
			Q("#mappings-visual g").append(elInstance1, elInstance0, svgArrow({x1: svgX0, y1: svgY0, x2: svgX1, y2: svgY1, tipLen: 7, tipWid: 7, strokeWidth: 1, color: instanceColor})); // add an arrow
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

		const svgCoordsFrom = svgCoordsFromAxisCoords(mapping[0]);
		const svgCoordsTo = svgCoordsFromAxisCoords(mapping[1]);

		elInput.setPosition(svgCoordsFrom);
		elInput.style.opacity = 0.8;
		elOutput.setPosition(svgCoordsTo);
		elOutput.style.opacity = 0.4;

		// draw the arrow
		const arrowSvg = svgArrow({index: m, x1: svgCoordsFrom[0], y1: svgCoordsFrom[1], x2: svgCoordsTo[0], y2: svgCoordsTo[1], tipLen: 11, tipWid: 11, strokeWidth: 2});
		arrowSvg.classList.add("mapping");

		// add them all to the SVG element		
		Q("#mappings-visual g").append(arrowSvg, elOutput, elInput);
	});

	// display the current location (untransformed #0 and transformed #1)
	// - render #1 first since it may be underneath #0 (which needs mouse events)
	const elCurrent0 = SVG("g"), elCurrent1 = SVG("g");

	const svgCoordsFrom = svgCoordsFromAxisCoords(GLOBAL.current[0]);
	const svgCoordsTo = svgCoordsFromAxisCoords(GLOBAL.current[1]);

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

	// update the output locations for the current axis, if it’s selected
	if (GLOBAL.draggingIndex === -1) {
		Qall(".axes .axis").forEach((axisEl, a) => {
			axisEl.querySelectorAll("input.output").forEach(el => el.value = GLOBAL.current[1][a]);
		});
		formatNumericControls(-1);
	}	

	// draw the current arrow
	const arrowSvg = svgArrow({index: -1, x1: svgCoordsFrom[0], y1: svgCoordsFrom[1], x2: svgCoordsTo[0], y2: svgCoordsTo[1], tipLen: 7, tipWid: 7, strokeWidth: 1, color: "var(--currentLocationColor)"});
	Q("#mappings-visual g").append(elCurrent1, elCurrent0, arrowSvg); // order is important, since we must be able to click on the [0] version if they overlap

	// draw the rulers
	const rulerX = Q(".ruler.horizontal"), rulerY = Q(".ruler.vertical");
	const rulerGraticulesX = getGraticulesForAxis(visibleAxes[0], "ruler");
	const rulerGraticulesY = getGraticulesForAxis(visibleAxes[1], "ruler");

	if (!rulerX.textContent) {
		rulerGraticulesX.forEach(x => {
			const label = EL("div", {style: `position: absolute; transform: rotate(-90deg); transform-origin: left; bottom: 0; left: ${svgCoordFromAxisCoord(visibleAxes[0].axisId, x)}px`});
			label.textContent = x;
			rulerX.append(label);
		});
	}
	if (!rulerY.textContent) {
		rulerGraticulesY.forEach(y => {
			const label = EL("div", {style: `position: absolute; right: 0; bottom: ${svgCoordFromAxisCoord(visibleAxes[1].axisId, y)-10}px`});
			label.textContent = y;
			rulerY.append(label);
		});
	}
}

function svgMouseMove(e) {

	e.preventDefault();
	e.stopPropagation();
	if (!GLOBAL.dragging)
		return;

	const visibleAxisIds = getVisibleAxisIds(); // which axes are we using?
	const el = GLOBAL.dragging; // not e.target
	const index = parseInt(el.dataset.index); // should be the same as GLOBAL.draggingIndex, as set in mousedown event
	const rect =  Q(".svg-container").getBoundingClientRect();


	const mousex = e.clientX;
	const mousey = rect.height - e.clientY;
	const x = mousex - rect.left;
	const y = mousey + rect.top;
	const svgX = x - GLOBAL.dragOffset[0];
	const svgY = y - GLOBAL.dragOffset[1];

	let xCoord = axisCoordFromSvgCoord(visibleAxisIds[0], svgX);
	let yCoord = axisCoordFromSvgCoord(visibleAxisIds[1], svgY);
	if (Q("#integer-snapping").checked) {
		xCoord = Math.round(xCoord);
		yCoord = Math.round(yCoord);
	}
	xCoord = Math.min(xCoord, GLOBAL.font.fvar.axes[visibleAxisIds[0]].maxValue);
	xCoord = Math.max(xCoord, GLOBAL.font.fvar.axes[visibleAxisIds[0]].minValue);
	yCoord = Math.min(yCoord, GLOBAL.font.fvar.axes[visibleAxisIds[1]].maxValue);
	yCoord = Math.max(yCoord, GLOBAL.font.fvar.axes[visibleAxisIds[1]].minValue);

	const inputOrOutputId = +el.classList.contains("output"); // yields 0 for input, 1 for output (works for current as well as mappings)
	const mapping = index === -1 ? GLOBAL.current : GLOBAL.mappings[GLOBAL.draggingIndex];
	mapping[inputOrOutputId][visibleAxisIds[0]] = xCoord;
	mapping[inputOrOutputId][visibleAxisIds[1]] = yCoord;

	updatePucks(svgCoordsFromAxisCoords(mapping[inputOrOutputId])); // they were made visible in mousedown event

	mappingsChanged();
	updateMappingsSliders(index);
	updateMappingsXML();
	updateRenders();
}

function svgMouseUp(e) {
	e.stopPropagation();

	const rect =  Q(".svg-container").getBoundingClientRect();

	const x = e.clientX;
	const y = e.clientY;

	GLOBAL.dragging = undefined;
	GLOBAL.dragOffset = undefined;

	// hide pucks
	Qall(".ruler .puck").forEach(el => el.classList.add("hidden"));

	// disable what we put in place when we started dragging
	document.onmousemove = null;
	document.onmouseup = null;
}

function mappingMouseDown (e) {

	// if we hit the line, propagate the event
	// - this works for icons for mapping location and current location
	const el = e.target.closest("g.location");
	if (!el) {
		return false;
	}

	// we hit a location
	e.preventDefault();
	e.stopPropagation();

	const rect =  Q(".svg-container").getBoundingClientRect();
	
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
	const visibleAxisIds = getVisibleAxisIds();
	svgX -= dx;
	svgY -= dy;
	let xCoord = axisCoordFromSvgCoord(visibleAxisIds[0], svgX);
	let yCoord = axisCoordFromSvgCoord(visibleAxisIds[1], svgY);

	// show pucks
	Qall(".ruler .puck").forEach(el => el.classList.remove("hidden"));
	const inputOrOutputId = el.classList.contains("input") ? 0 : 1;
	const mapping = GLOBAL.draggingIndex === -1 ? GLOBAL.current : GLOBAL.mappings[GLOBAL.draggingIndex];
	updatePucks(svgCoordsFromAxisCoords(mapping[inputOrOutputId]));

	// these need to be on the document, not on the mousedown element
	document.onmousemove = svgMouseMove;
	document.onmouseup = svgMouseUp; // maybe mouseup should be when overflows (outside of min/max) are snapped back to [min,max]
}

// update the position of the pucks on each ruler
// TODO: fix issue with puck positions (it changes with string length)
function updatePucks(svgCoords) {
	const [svgX, svgY] = svgCoords;
	const visibleAxisIds = getVisibleAxisIds();
	const hPuck = Q(".ruler.horizontal .puck"), vPuck = Q(".ruler.vertical .puck");
	const coords = [axisCoordFromSvgCoord(visibleAxisIds[0], svgX), axisCoordFromSvgCoord(visibleAxisIds[1], svgY)];
	hPuck.classList.remove("hidden");
	hPuck.textContent = Math.round(coords[0] * 100)/100;
	hPuck.style.left = `${svgX-20}px`
	vPuck.classList.remove("hidden");
	vPuck.textContent = Math.round(coords[1] * 100)/100;
	vPuck.style.bottom = `${svgY-8}px`
}

// return a sorted array of values that span the axis from min to max, and are base 10 friendly
function getGraticulesForAxis(axis, graticuleSpec) {

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
		for (let val = svgCoordFromAxisCoord(axis.axisId, axis.defaultValue) + inc; axisCoordFromSvgCoord(axis.axisId, val) < axis.maxValue; val += inc) { // get the max side of the axis
			graticules.add(axisCoordFromSvgCoord(axis.axisId, val));
		}
		for (let val = svgCoordFromAxisCoord(axis.axisId, axis.defaultValue) - inc; axisCoordFromSvgCoord(axis.axisId, val) > axis.minValue; val -= inc) { // get the min side of the axis
			graticules.add(axisCoordFromSvgCoord(axis.axisId, val));
		}
	}

	return [...graticules].sort((a,b)=>a-b); // return an array of the set (i.e. a unique array)
}

function deltaSetScale (deltaSet, scale=0x4000, round=true) {
	const scaledDeltaSet = [];
	deltaSet.forEach((delta, d) => scaledDeltaSet[d] = round ? Math.round(delta * scale) : delta * scale );
	return scaledDeltaSet;
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
			["input", "output"].forEach((io, inputOrOutputId) => {
				mappingEl.querySelectorAll(`${io}>dimension`).forEach(dimEl => {
					const axisName = dimEl.getAttribute("name");
					const axis = GLOBAL.font.fvar.axes.find(axis => axis.name === axisName);
					if (axisName && axis) {
						const value = parseFloat(dimEl.getAttribute("xvalue"));
						if (valueInAxisRange(value, axis)) {
							mapping[inputOrOutputId][axis.axisId] = value;
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
		GLOBAL.mappings.length = 0;
		GLOBAL.mappings.push(...mappings);
		mappingsChanged();
		updateMappingsSliders(-1);
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
				if (x !== undefined && axis.defaultValue !== x)
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
		details.innerHTML = mappingStr
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

function updateSVGTransform() {

	// fix the transform
	Q("#mappings-visual g").attr({
		transform: `scale(1 -1) translate(10 -${Q(".svg-container").getBoundingClientRect().height + 10})`,
	});

	// draw the rulers
	const visibleAxisIds = getVisibleAxisIds();
	const visibleAxes = visibleAxisIds.map(a => GLOBAL.font.fvar.axes[a]);
	const rulerX = Q(".ruler.horizontal"), rulerY = Q(".ruler.vertical");
	const rulerGraticulesX = getGraticulesForAxis(visibleAxes[0], "ruler");
	const rulerGraticulesY = getGraticulesForAxis(visibleAxes[1], "ruler");

	// update the axis graticules
	Qall(".graticule").forEach(el => el.remove());
	rulerGraticulesX.forEach(x => {
		const label = EL("div", {class: "graticule", style: `left: ${svgCoordFromAxisCoord(visibleAxisIds[0], x)}px`});
		label.textContent = x;
		rulerX.append(label);
	});
	rulerGraticulesY.forEach(y => {
		const label = EL("div", {class: "graticule", style: `bottom: ${svgCoordFromAxisCoord(visibleAxisIds[1], y)-8}px`});
		label.textContent = y;
		rulerY.append(label);
	});
}


function selectAxisControls(e) {

	mappingsSelectorPopulate();
}


function initFencer() {

	const fontinfo = Q(".fontinfo");
	fontinfo.addEventListener("dragover", e => e.preventDefault() ); // prevent default to allow drop
	fontinfo.addEventListener("drop", onDropFont);

	// init the svg
	GLOBAL.svgEl = SVG("svg");
	GLOBAL.svgEl.append(SVG("g")); // this <g> element has all the content and has a transform
	GLOBAL.svgEl.id = "mappings-visual";
	
	Q("#mapping-selector").onchange = selectAxisControls;

	Q(".window.mappings-ui .svg-container").append(GLOBAL.svgEl);

	Q("#sample-text").oninput = sampleTextChange; // handle change of sample text
	Q("#mapping-selector").onchange = selectMapping; // handle change of mappings selector
	Q("#grid-style").onchange = e => {
		localStorage.setItem("fencer:gridStyle", e.target.value);
		mappingsChanged();
	};
	Q("#add-render").onclick = addRender;
	Q("#download-font").onclick = downloadFont;

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

		function saveWindowProperties() {
			// save window states in local storage (position has changed for this window, classes may have changed for other windows)
			// - TODO: add z-index to the stored properties for all windows when we implement it in UI
			Qall(".window").forEach(el => {
				const name = el.querySelector(":scope > h2").textContent;
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
		const windowProps = JSON.parse(localStorage.getItem(`fencer:window[${name}]`));
		if (windowProps) {
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

					if (windowEl.classList.contains("mappings-ui")) {
						mappingsChanged(); // update the SVG, yay!
						updateSVGTransform();
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

	// get the axis values

	// update all renders
	Qall(".render-item").forEach((renderItemEl, r) => {
		const renderEl = renderItemEl.querySelector(".render");
		const fvsEntries = [];

		if (r===0) {
			GLOBAL.font.fvar.axes.forEach((axis, a) => {
				fvsEntries.push(`"${axis.axisTag}" ${GLOBAL.current[0][a]}`);
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
			});
		}		
		renderEl.style.fontVariationSettings = fvsEntries.join();
	});
}


function selectMapping(e) {

	GLOBAL.draggingIndex = parseInt(e.target.value);
	updateMappingsSliders(GLOBAL.draggingIndex);

}

initFencer();

