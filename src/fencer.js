"use strict"

// import samsa-core and fontTools.varLib models
//import { SamsaFont, SamsaInstance, SamsaBuffer, SAMSAGLOBAL } from "https://lorp.github.io/samsa-core/src/samsa-core.js";
import { SamsaFont, SamsaInstance, SamsaBuffer, SAMSAGLOBAL } from "./samsa-core/samsa-core.js";
//import { normalizeValue, piecewiseLinearMap, VariationModel } from "./models.js";
import { VariationModel } from "./models.js";

import { VariationModel as VM} from "./fontra-src-client-core/var-model.js";



console.log(VariationModel);
console.log(VariationModel.getMasterLocationsSortKeyFunc);


console.log("VarationModel (Fontra)");
console.log(VM);


//console.log(piecewiseLinearMap)


let mappingsSVG;
// const svgPre = `<svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">`;
// const svgPost = `</svg>`;
const svgArrowHandleRadius = 15;
const svgArrowHandleRadiusRoot2 = svgArrowHandleRadius * 1/Math.sqrt(2);
const svgCurrentLocationRadius = 10;
const svgArrowLineWidth = 2;
const svgArrowHead = `<circle cx="0" cy="0" r="${svgArrowHandleRadius}" fill="#0003" stroke="currentColor" stroke-width="${svgArrowLineWidth}"/><circle cx="0" cy="0" r="5" fill="currentColor" stroke="none"/>`;
const svgArrowTail = `<circle cx="0" cy="0" r="${svgArrowHandleRadius}" fill="#0003" stroke="currentColor" stroke-width="${svgArrowLineWidth}"/><line x1="${-svgArrowHandleRadiusRoot2}" y1="${-svgArrowHandleRadiusRoot2}" x2="${svgArrowHandleRadiusRoot2}" y2="${svgArrowHandleRadiusRoot2}" stroke="currentColor" stroke-width="${svgArrowLineWidth}"/><line x1="${-svgArrowHandleRadiusRoot2}" y1="${svgArrowHandleRadiusRoot2}" x2="${svgArrowHandleRadiusRoot2}" y2="${-svgArrowHandleRadiusRoot2}" stroke="currentColor" stroke-width="${svgArrowLineWidth}"/>`;
const svgCurrentLocation = `<circle cx="0" cy="0" r="${svgCurrentLocationRadius+svgArrowLineWidth}" fill="white" stroke="none"/><circle cx="0" cy="0" r="${svgCurrentLocationRadius}" fill="#077bf6" stroke="none"/>`;

const GLOBAL = {
	svgElWidth: 400,
	mappings: [],
	current: [[],[]],
	draggingIndex: -1, // starts current location, not a mapping
	mappingsView: [],
	axisTouched: -1,
	fontFace: undefined,
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

Element.prototype.attr = function (attrs) {
	for (const prop in attrs) {
		this.setAttributeNS(null, prop, attrs[prop])
	}
}

Element.prototype.setPosition = function (position) {
	this.setAttribute("transform", `translate(${position[0]}, ${position[1]})`)
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
		return (value - axis.defaultValue) / (axis.defaultValue - axis.minValue);
	}
	else if (value > axis.defaultValue) {
		return (value - axis.defaultValue) / (axis.maxValue - axis.defaultValue);
	}
	return undefined; // never gets here
}

// takes a mapping and makes all its values normalized to the range [-1, 1], represented in f2.14, so actually as integers in the range [-16384, 16384]
function mappingSimpleNormalize(axes, mapping) {

	const normalizedMapping = [[],[]];

	axes.forEach((axis, a) => {
		// normalizedMapping[0][a] = Math.round(0x4000 * simpleNormalize(axis, mapping[0][a]));
		// normalizedMapping[1][a] = Math.round(0x4000 * simpleNormalize(axis, mapping[1][a]));
		normalizedMapping[0][a] = simpleNormalize(axis, mapping[0][a]);
		normalizedMapping[1][a] = simpleNormalize(axis, mapping[1][a]);
	});

	return normalizedMapping;
}

window.onkeydown = function (e) {

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
	updateMappingsSVG();
	updateMappingsXML();
	updateRenders();

}


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

function getArrowPath (arrow) {

	// call with getArrowParams({x1: x1, x2: x2, y1: y1, y2: y2, tipLen: tipLen, tipWid: tipWid})

	const x1 = arrow.x1, y1 = arrow.y1, x2 = arrow.x2, y2 = arrow.y2;
	const tipLen = arrow.tipLen, tipWid = arrow.tipWid;
	const points = [];

	if (x2!=x1 || y2!=y1) {
		const len = Math.sqrt((x2-x1)*(x2-x1)+(y2-y1)*(y2-y1));
		const arrowBackX = (y2-y1) * tipWid/2/len, arrowBackY = (x2-x1) * tipWid/2/len;

		arrow.arrowX1 = arrow.arrowX2 = arrow.newX2 = x1 + (x2-x1) * (len-tipLen)/len;
		arrow.arrowY1 = arrow.arrowY2 = arrow.newY2 = y1 + (y2-y1) * (len-tipLen)/len;
		arrow.arrowX1 += arrowBackX;
		arrow.arrowY1 -= arrowBackY;
		arrow.arrowX2 -= arrowBackX;
		arrow.arrowY2 += arrowBackY;

		points.push([arrow.arrowX1, arrow.arrowY1], [arrow.arrowX2, arrow.arrowY2], [arrow.x2, arrow.y2]);

	}

	let pathStr = "";
	points.forEach((point, p) => {
		pathStr += (p===0 ? "M" : "L") + point[0] + " " + point[1];
		if (p===points.length-1) {
			pathStr += "Z";
		}
	});

	return pathStr;
}

function axisCoordFromSvgCoord (a, val) {
	const axis = GLOBAL.font.fvar.axes[a];
	// console.log(a, "axis");
	// console.log(axis, val, val / GLOBAL.svgElWidth * (axis.maxValue - axis.minValue) + axis.minValue);
	// console.log(axis)
	//return (val - axis.minValue) / (axis.maxValue - axis.minValue) * GLOBAL.svgElWidth;



	//v = (val - axis.minValue) / (axis.maxValue - axis.minValue) * GLOBAL.svgElWidth

	return val / GLOBAL.svgElWidth * (axis.maxValue - axis.minValue) + axis.minValue;
}

function svgCoordFromAxisCoord (a, val) {
	const axis = GLOBAL.font.fvar.axes[a];
	return (val - axis.minValue) / (axis.maxValue - axis.minValue) * GLOBAL.svgElWidth;
}

function svgCoordsFromAxisCoords (coords) {

	const a0 = coords[GLOBAL.mappingsView[0]];
	const a1 = coords[GLOBAL.mappingsView[1]];

	const s0 = svgCoordFromAxisCoord(GLOBAL.mappingsView[0], a0);
	const s1 = svgCoordFromAxisCoord(GLOBAL.mappingsView[1], a1);

	return [s0, s1];
}

function loadFontFromArrayBuffer (arrayBuffer, options={}) {

	//RobotoA2-avar1-VF.ttf

	GLOBAL.font = new SamsaFont(new SamsaBuffer(arrayBuffer));
	GLOBAL.familyName = GLOBAL.font.names[6];

	let str = "";

	// filename, font name
	str += options.filename ?? "" + "\n";
	str += GLOBAL.font.names[6] + "\n";
	str += "---\n";

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
	str += "AXES: \n";
	GLOBAL.font.fvar.axes.forEach(axis => {
		str += `${axis.axisTag} ${axis.minValue} ${axis.defaultValue} ${axis.maxValue}\n`;
	});
	// document.querySelector(".fontinfo textarea").value = str; // set the textarea content to the string


	// add key

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
	key[1].style.gridColumn = "2 / 4";
	key[3].style.gridColumn = "5 / 7";

	keyEl.append(...key);
	Q("#axes").append(keyEl);
	
	// tag value slider reset check check
	GLOBAL.font.fvar.axes.forEach((axis, a) => {
		const axisEl = EL("div");
		axisEl.classList.add("axis");
		axisEl.dataset.axisId = a;

		// grid-template-columns: 40px 40px 1fr auto 40px 1fr auto 16px 16px;

		//const row = [ EL("input"), EL("div"), EL("div"), EL("div"), EL("input"), EL("input") ];
		const row = [ EL("input"), EL("input"), EL("input"), EL("div"), EL("input"), EL("input"), EL("div"), EL("input"), EL("input")];

		row[0].value = axis.axisTag;
		row[0].classList.add("monospace");
		row[0].disabled = true;
		row[0].title = `${axis.axisTag} (${axis.name})\nmin: ${axis.minValue}\ndefault: ${axis.defaultValue}\nmax: ${axis.maxValue}`;

		// right-arrow unicode is 
		row[3].textContent = "→";

		// input/output numerics
		const inNumEl = EL("input");
		const outNumEl = EL("input");
		inNumEl.value = axis.defaultValue;
		inNumEl.classList.add("input", "numeric");
		outNumEl.value = axis.defaultValue;
		outNumEl.classList.add("output", "numeric");
		row[1] = inNumEl;
		row[4] = outNumEl;

		// input/output sliders
		const inEl = EL("input");
		inEl.type = "range";
		inEl.style.width = "100%";
		inEl.min = axis.minValue;
		inEl.max = axis.maxValue;
		inEl.value = axis.defaultValue;
		inEl.step = "0.001";
		inEl.classList.add("slider", "input", "slider");

		const outEl = EL("input");
		outEl.type = "range";
		outEl.style.width = "100%";
		outEl.min = axis.minValue;
		outEl.max = axis.maxValue;
		outEl.value = axis.defaultValue;
		outEl.step = "0.001";
		outEl.classList.add("slider", "output", "slider");

		row[2] = inEl;
		row[5] = outEl;

		// set change event for all input elements
		inNumEl.oninput = outNumEl.oninput = inEl.oninput = outEl.oninput = axisChange;

		row[6].style.fontFamily = "Material Symbols Outlined";
		row[6].textContent = "refresh";
		row[6].onclick = axisReset;
		row[6].title = "Reset input axis\n(shift-click to reset output axis)";

		row[7].type = "radio";
		row[7].name = "x-axis";
		row[7].value = a;
		row[7].checked = (a==0);
		row[7].onchange = axisCheckboxChange;

		row[8].type = "radio";
		row[8].name = "y-axis";
		row[8].value = a;
		row[8].checked = (a==1);
		row[8].onchange = axisCheckboxChange;

		axisEl.append(...row);

		Q("#axes").append(axisEl);

		GLOBAL.current[0][a] = axis.defaultValue;
		GLOBAL.current[1][a] = axis.defaultValue;
	});

	// set initial mode to "axes", make the output axes disabled
	//setMode();
	selectAxisControls();

	function axisChange (e) {

		const inputOrOutput = e.target.classList.contains("input") ? "input" : "output";
		// console.log(inputOrOutput);
		const inputOrOutputId = (inputOrOutput === "input") ? 0 : 1;

		const elMarker = (GLOBAL.draggingIndex === -1) ? Q("g.current") : Q(`g.location.${inputOrOutput}[data-index="${GLOBAL.draggingIndex}"]`);
		const el = e.target;
		const axisEl = el.closest(".axis");
		const axisId = parseInt(axisEl.dataset.axisId);
		const otherInputEl = el.classList.contains("slider") ? axisEl.querySelector(`.${inputOrOutput}.numeric`) : axisEl.querySelector(`.${inputOrOutput}.slider`);
		otherInputEl.value = el.value;

		// move the marker
		if (GLOBAL.draggingIndex === -1) {
			GLOBAL.current[inputOrOutputId][axisId] = parseFloat(el.value);
			elMarker.setPosition(svgCoordsFromAxisCoords(GLOBAL.current[0]));

			// hack (set output = input)
			// FIX THIS WHEN avar2 COMPILATION WORKING
			axisEl.querySelectorAll("input.output").forEach(outputEl => outputEl.value = parseFloat(el.value));

		}
		else {
			// const mapping = GLOBAL.mappings[GLOBAL.draggingIndex];
			// mapping[inputOrOutputId][axisId] = parseFloat(el.value);

			const mapping = GLOBAL.mappings[GLOBAL.draggingIndex];
			mapping[inputOrOutputId][axisId] = parseFloat(el.value);
			const [svgX, svgY] = svgCoordsFromAxisCoords(mapping[inputOrOutputId]);
			elMarker.setPosition([svgX, svgY]);
			
			// update the arrow
			const arrowEl = Q(`.arrow[data-index="${GLOBAL.draggingIndex}"]`);
			if (arrowEl) { // sanity

				updateArrow(arrowEl, inputOrOutputId, svgX, svgY);

			}
		}

		GLOBAL.axisTouched = axisId;

		updateRenders();
		updateMappingsXML();
	}

	function axisReset (e) {
		console.log("axisReset");
		const el = e.target;
		const parentEl = el.closest(".axis,.key");
		const inputOrOutput = +e.shiftKey; // 0 for input, 1 for output

		// is this the reset button of the key row?
		if (parentEl.classList.contains("key")) {

			if (GLOBAL.draggingIndex === -1) {
				GLOBAL.current[0] = getDefaultAxisCoords();
				GLOBAL.current[1] = [...GLOBAL.current[0]]; // this is safe, as default is never transformed (this MUST be a separate array)
			}
			else {
				GLOBAL.mappings[GLOBAL.draggingIndex][inputOrOutput] = getDefaultAxisCoords();
			}
		}

		// is this the reset button of an axis row?
		else {
			const axisEl = parentEl;
			console.log(axisEl);
			const axisId = parseInt(axisEl.dataset.axisId);
			const axis = GLOBAL.font.fvar.axes[axisId];

			if (GLOBAL.draggingIndex === -1) {
				GLOBAL.current[0][axisId] = axis.defaultValue;
				GLOBAL.current[1][axisId] = axis.defaultValue;
			}
			else {
				GLOBAL.mappings[GLOBAL.draggingIndex][inputOrOutput][axisId] = axis.defaultValue;
			}
		}

		// updates
		updateMappingsSliders(GLOBAL.draggingIndex);
		updateMappingsSVG();
		updateMappingsXML();
		updateRenders();
	}

	function axisCheckboxChange(e) {
		let xSelected, ySelected;
		const orientationChosen = e.target.name === "x-axis" ? "x-axis" : "y-axis";
		const orientationNotChosen = e.target.name === "y-axis" ? "x-axis" : "y-axis";
		Qall("#axes .axis").forEach(axisEl => {
			if (axisEl.querySelector("input[name=x-axis]").checked)
				xSelected = axisEl.querySelector("input[name=x-axis]").value;

			if (axisEl.querySelector("input[name=y-axis]").checked)
				ySelected = axisEl.querySelector("input[name=y-axis]").value;
		});

		// ensure the x and y axis are different: force the other axis to be the first available axis
		// - TODO: make this work for single-axis fonts
		if (xSelected && ySelected && (xSelected === ySelected)) {
			const axisEls = Qall("#axes .axis");
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
		Qall("#axes .axis").forEach((axisEl, a) => {
			if (axisEl.querySelector("input[name=x-axis]").checked)
				GLOBAL.mappingsView[0] = a;

			if (axisEl.querySelector("input[name=y-axis]").checked)
				GLOBAL.mappingsView[1] = a;
		});


		// redraw the mappings SVG
		// - TODO: decide if we need to update the mappingsView array
		updateMappingsSVG();
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

	// draw mappings SVG
	updateMappingsSVG();
	updateRenders();

	// if these axes represent the current location, disable all the initial input elements with class "output"
	if (GLOBAL.draggingIndex === -1) {
		Qall("#axes .axis input.output").forEach(el => el.disabled = true);
	}

}

function onDropFont (e) {
	const el = e.target;

	e.preventDefault();

	// delete contents of the axes container
	Q("#axes").innerHTML = "";

	// get arrayBuffer from dropped object
	const file = e.dataTransfer.files[0];
	file.arrayBuffer().then(arrayBuffer => {

		loadFontFromArrayBuffer(arrayBuffer);

	});
}

function getDefaultAxisCoords() {

	return GLOBAL.font.fvar.axes.map((axis, a) => axis.defaultValue );
}

function addRender() {

	const currentAxisCoords = GLOBAL.current[0];
	
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
		valueEl.value = currentAxisCoords[a];

		// lock/unlock
		const lockEl = EL("div");
		lockEl.classList.add("lock"); // we remove the class "locked" when it is unlocked
		lockEl.onclick = lockElclick;
	
		axisEl.append(tagEl, valueEl, lockEl);
		controlsEl.append(axisEl);
	});

	// the render item
	const renderItemEl = EL("div");
	renderItemEl.classList.add("render-item");

	// the render itself
	const renderEl = EL("div");
	renderEl.classList.add("render");
	renderEl.innerText = Q("#sample-text").value;
	renderEl.style.fontFamily = GLOBAL.familyName;
	
	renderItemEl.append(renderEl, controlsEl, controlsButtonEl);

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
		//controlsEl.style.display = "grid";
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

	mappingsSelectorPopulate();

	// update stuff
	updateMappingsSVG();
	updateMappingsXML();
}

function deleteMapping() {

	if (GLOBAL.draggingIndex >= 0) {

		console.log(`document.querySelector('.arrow[data-index="${GLOBAL.draggingIndex}"]')`);
		console.log(`document.querySelector('.input.location[data-index="${GLOBAL.draggingIndex}"]')`);
		console.log(`document.querySelector('.output.location[data-index="${GLOBAL.draggingIndex}"]')`);

		// we don’t actually have to remove the elements, because we immediately redraw the SVG
		// Q(`.arrow[data-index="${GLOBAL.draggingIndex}"]`).remove();
		// Q(`.input.location[data-index="${GLOBAL.draggingIndex}"]`).remove();
		// Q(`.output.location[data-index="${GLOBAL.draggingIndex}"]`).remove();

		GLOBAL.mappings.splice(GLOBAL.draggingIndex, 1);

		GLOBAL.dragging = undefined;
		GLOBAL.draggingIndex = 0;

		mappingsSelectorPopulate();
	}

	Q("#mapping-selector").value = -1;
	Q("#mapping-selector").dispatchEvent(new Event("change"));

	// repopulate the mapping selector

	// renumber the existing mappings


	// update stuff
	updateMappingsSVG();
	updateMappingsXML();
}

function getVisibleAxisIds() {
	const xAxisEl = Q("input[name=x-axis]:checked").closest(".axis");
	const yAxisEl = Q("input[name=y-axis]:checked").closest(".axis");
	const xAxisIndex = parseInt(xAxisEl.dataset.axisId);
	const yAxisIndex = parseInt(yAxisEl.dataset.axisId);

	return [xAxisIndex, yAxisIndex];
}

function svgArrow(i, x1, y1, x2, y2) {

	const arrowSvg = SVG("g");
	arrowSvg.classList.add("arrow");
	arrowSvg.dataset.index = i;

	const lineEl = SVG("line");
	lineEl.attr({x1: x1, y1: y1, x2: x2, y2: y2, stroke: "black", "stroke-width": 2});
	arrowSvg.appendChild(lineEl);

	const pathEl = SVG("path");
	const pathStr = getArrowPath({x1: x1, y1: y1, x2: x2, y2: y2, tipLen: 20, tipWid: 15});
	pathEl.attr({d: pathStr, stroke: "none" });
	arrowSvg.appendChild(pathEl);

	return arrowSvg;
}

function svgMouseMove(e) {

	e.stopPropagation();

	const visibleAxisIds = getVisibleAxisIds(); // which axes are we using?
	const el = GLOBAL.dragging;
	const index = parseInt(el.dataset.index);
	const rect = GLOBAL.svgEl.getBoundingClientRect();
	const mousex = e.clientX;
	const mousey = rect.height - e.clientY;
	const x = mousex - rect.left;
	const y = mousey + rect.top;
	const svgX = x - GLOBAL.dragOffset[0];
	const svgY = y - GLOBAL.dragOffset[1];

	// move the location marker
	el.setAttribute("transform", `translate(${svgX}, ${svgY})`);
	const [xCoord, yCoord] = [axisCoordFromSvgCoord(visibleAxisIds[0], svgX), axisCoordFromSvgCoord(visibleAxisIds[1], svgY)];

	if (index === -1) { // current location
		// it’s the current location marker
		GLOBAL.current[0][visibleAxisIds[0]] = xCoord; // input
		GLOBAL.current[0][visibleAxisIds[1]] = yCoord; // input
		GLOBAL.current[1][visibleAxisIds[0]] = xCoord; // output
		GLOBAL.current[1][visibleAxisIds[1]] = yCoord; // output
		updateMappingsSliders(index);
	}
	else {
		// it’s a mapping location marker, so get the arrow with this index
		const mapping = GLOBAL.mappings[index];
		const arrowEl = Q(`.arrow[data-index="${index}"]`);
		if (arrowEl) { // sanity

			let inputOrOutputId;
			if (el.classList.contains("input"))
				inputOrOutputId = 0;
			else if (el.classList.contains("output"))
				inputOrOutputId = 1;

			console.assert(inputOrOutputId !== undefined, "We should be moving an input or an output, but this is neither");

			updateArrow(arrowEl, inputOrOutputId, svgX, svgY);
				
			if (inputOrOutputId === 0) {
				mapping[0][visibleAxisIds[0]] = xCoord;
				mapping[0][visibleAxisIds[1]] = yCoord;
			}
			else {
				mapping[1][visibleAxisIds[0]] = xCoord;
				mapping[1][visibleAxisIds[1]] = yCoord;
			}
			
			updateMappingsSliders(index);
			updateMappingsXML();
		}
	}

	updateRenders();
}

function updateArrow(arrowEl, inputOrOutputId, svgX, svgY) {

	const lineEl = arrowEl.querySelector("line");
	let x1 = parseFloat(lineEl.getAttribute("x1"));
	let y1 = parseFloat(lineEl.getAttribute("y1"));
	let x2 = parseFloat(lineEl.getAttribute("x2"));
	let y2 = parseFloat(lineEl.getAttribute("y2"));
	if (inputOrOutputId === 0) {
		x1 = svgX;
		y1 = svgY;
		lineEl.attr({x1: x1, y1: y1});
	}
	else if (inputOrOutputId === 1) {
		x2 = svgX;
		y2 = svgY;
		lineEl.attr({x2: x2, y2: y2});
	}

	const pathEl = arrowEl.querySelector("path");
	const pathStr = getArrowPath({x1: x1, x2: x2, y1: y1, y2: y2, tipLen: 20, tipWid: 15});
	pathEl.attr({d: pathStr});

}

function svgMouseUp(e) {
	e.stopPropagation();

	const rect = GLOBAL.svgEl.getBoundingClientRect();
	const x = e.clientX;
	const y = e.clientY;

	GLOBAL.svgEl.removeEventListener("mousemove", svgMouseMove); // = undefined;
	GLOBAL.svgEl.removeEventListener("mouseup", svgMouseUp); // = undefined;
	//GLOBAL.dragging = undefined;
	GLOBAL.dragOffset = undefined;

}

function mappingMouseDown (e) {

	// if we hit the line, propagate the event
	// - this works for icons for mapping location and current location
	const el = e.target.closest("g.location");
	if (!el) {
		return false;
	}

	// we hit a location
	e.stopPropagation();

	const rect = GLOBAL.svgEl.getBoundingClientRect();
	GLOBAL.draggingIndex = parseInt(el.dataset.index);


	const transform = el.getAttribute("transform");
	const coordsStr = transform.match(/translate\(([^)]+),\s*([^)]+)\)/); // parse float in JS, not regex
	const coords = [parseFloat(coordsStr[1]), parseFloat(coordsStr[2])];

	const mousex = e.clientX;
	const mousey = rect.height - e.clientY;

	const svgX = mousex - rect.left;
	const svgY = mousey + rect.top;

	const dx = svgX - coords[0];
	const dy = svgY - coords[1];

	GLOBAL.dragOffset = [dx, dy];
	GLOBAL.dragging = el;

	GLOBAL.svgEl.addEventListener("mousemove", svgMouseMove);
	GLOBAL.svgEl.addEventListener("mouseup", svgMouseUp); // maybe mouseup should be when overflows (outside of min/max) are snapped back to [min,max]

	// refresh sliders with data from the relevant mapping (or current location, which has index == -1)
	Q("#mapping-selector").value = GLOBAL.draggingIndex;
	updateMappingsSliders(GLOBAL.draggingIndex);

}

function updateMappingsSVG() {

//	console.log(GLOBAL);
	GLOBAL.svgEl.innerHTML = "";

	// draw x-axis and y-axis
	const svgOriginCoords = svgCoordsFromAxisCoords(getDefaultAxisCoords());
	
	const xAxisEl = SVG("line", {x1:0, y1:svgOriginCoords[1], x2:400, y2:svgOriginCoords[1], stroke: "grey"});
	const yAxisEl = SVG("line", {x1:svgOriginCoords[0], y1:0, x2:svgOriginCoords[0], y2:400, stroke: "grey"});
	GLOBAL.svgEl.appendChild(xAxisEl);
	GLOBAL.svgEl.appendChild(yAxisEl);


	GLOBAL.mappings.forEach((mapping, m) => {

		const elInput = SVG("g");
		const elOutput = SVG("g");
	
		elInput.classList.add("input", "location");
		elOutput.classList.add("output", "location");
	
		elInput.innerHTML = svgArrowTail;
		elOutput.innerHTML = svgArrowHead;
	
		elInput.onmousedown = mappingMouseDown;
		elOutput.onmousedown = mappingMouseDown;

		elInput.dataset.index = m;
		elOutput.dataset.index = m;
	
		const svgCoordsFrom = svgCoordsFromAxisCoords(mapping[0]);
		const svgCoordsTo = svgCoordsFromAxisCoords(mapping[1]);

		elInput.setPosition(svgCoordsFrom);
		elOutput.setPosition(svgCoordsTo);
	
		GLOBAL.svgEl.appendChild(elInput);
		GLOBAL.svgEl.appendChild(elOutput);

		// draw the arrow
		const arrowSvg = svgArrow(m, svgCoordsFrom[0], svgCoordsFrom[1], svgCoordsTo[0], svgCoordsTo[1]);
		GLOBAL.svgEl.appendChild(arrowSvg);
	
	});


	// create the current location icon
	const elCurrent = SVG("g");
	elCurrent.classList.add("current", "location");
	elCurrent.dataset.index = -1;
	elCurrent.innerHTML = svgCurrentLocation;
	elCurrent.setPosition(svgCoordsFromAxisCoords(GLOBAL.current[0]));
	GLOBAL.svgEl.appendChild(elCurrent);
	elCurrent.onmousedown = mappingMouseDown;
	elCurrent.onmousedown = mappingMouseDown;
	
}


function deltaSetScale (deltaSet, scale=0x4000, round=true) {
	const scaledDeltaSet = [];
	deltaSet.forEach((delta, d) => scaledDeltaSet[d] = round ? Math.round(delta * scale) : delta * scale );
	return scaledDeltaSet;
}


function updateMappingsXML() {

	function uint8ArrayToBase64(uint8) {
		return btoa(uint8.reduce((acc, ch) => acc + String.fromCharCode(ch), ""));
	}

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


	// let’s make an Item Variation Store!
	// - we create the list of IVS regions from the input mappings
	// - we create the delta sets from the output mappings
	// - we create a single ItemVariationData to store all the delta sets, ignoring the possibility to split them into multiple IVDs
	// - we create the IVS from the regions and the IVD
	// - we create the DeltaSetIndexMap object (note that all entries will have "outer" index = 0, since we only have one IVD)
	// - we create an avar table from the compiled IVS and DeltaSetIndexMap
	// - we insert the avar table into the font

	// set up the avar table that will contain the IVS
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

	// create the regions
	// - create a fonttools-style VariationModel by calling models.js
	const axisOrder = Array.from({ length: GLOBAL.font.fvar.axes.length }, (_, i) => String.fromCharCode(65 + i)); // fake axis names, guaranteed unique


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

	// are there any mappings? (locs.length==1 means no mappings)
	if (locs.length > 1) {

		if (1) { // this is Behdad’s method

			// translate supports into regions
			const model = new VariationModel(locs);
			model.supports
				.filter(support => Object.keys(support).length > 0)
				.forEach(support => ivs.regions.push(GLOBAL.font.fvar.axes.map((axis, a) => support.hasOwnProperty(axisOrder[a]) ? support[axisOrder[a]] : [0,0,0])));
		}

		// set up the IVD
		// - initialize the single IVD to include all the regions (we can optimize it later)
		ivs.ivds[0].regionIds = ivs.regions.map((region, r) => r);

		// Fontra method
		const fLocations = [{}]; // we need a null mapping to help the solver
		const masterValues = [];
		masterValues.push(new Array(axisCount).fill(0));
		normalizedMappings.forEach(mapping => {

			// const fLoc = {};
			// mapping[0].forEach((coord, a) => fLoc[axisOrder[a]] = coord); // we only care about input locations
			// fLocations.push(fLoc);

			// create an array of locations in object form, so we can use the solver
			fLocations.push(mapping[0].reduce((acc, coord, a) => {
				if (coord !== 0) acc[axisOrder[a]] = coord; // only assign non-zero values
				return acc;
			} , {} ));

			// create an array that is the difference between the input and output locations, and push it to the masterValues array
			masterValues.push(mapping[1].map((coord, a) => coord - mapping[0][a]));
		});

		const fModel = new VM(fLocations, axisOrder);

		// transpose the deltas array (ignoring the first row) and assign to the IVD
		const deltas = fModel.getDeltas(masterValues);
		for (let a=0; a<axisCount; a++) {
			const deltaSet = [];
			deltas.forEach((deltaRow, d) => {
				if (d > 0) // skip the first row, which is the default location
					deltaSet.push(deltaRow[a]);
			});
			ivs.ivds[0].deltaSets.push(deltaSetScale(deltaSet));
		}

		// prepare the axisIndexMap
		const innerIndexBitCount = 16, entrySize = 2;
		avar.axisIndexMap = {
			format: 0,
			entryFormat: (innerIndexBitCount - 1) | ((entrySize -1) << 4), // resolves to 1 byte with value 31 (0x1F)
			indices: new Array(GLOBAL.font.fvar.axisCount).fill(0).map((v, i) => i), // create an array [0, 1, 2, 3, ... axisCount-1]
		};

		// prepare the IVS
		const ivsBufOversize = new SamsaBuffer(new ArrayBuffer(10000));
		const ivsLength = ivsBufOversize.encodeItemVariationStore(ivs);
		avar.ivsBuffer = new SamsaBuffer(ivsBufOversize.buffer, 0, ivsLength); // the ivsBuffer we use is a slice of ivsBufOversize

		// write new avar table
		const avarBuf = GLOBAL.font.tableEncoders.avar(GLOBAL.font, avar);

		// create a new font
		const newFontBuf = exportFontWithTables(GLOBAL.font, { avar: avarBuf }); // we’re inserting an avar table with binary contents avarBuf

		// connect the new font to the UI
		GLOBAL.familyName = "Fencer-" + Math.random().toString(36).substring(7);
		if (GLOBAL.fontFace)
			document.fonts.delete(GLOBAL.fontFace);
		GLOBAL.fontFace = new FontFace(GLOBAL.familyName, newFontBuf.buffer);
		document.fonts.add(GLOBAL.fontFace);
		GLOBAL.fontFace.load().then(() => {
			Qall(".render").forEach( renderEl => renderEl.style.fontFamily = GLOBAL.familyName );
		});

		// assign the b64 blob to the download link
		if (1) {
			const uint8 = new Uint8Array(newFontBuf.buffer);
			const downloadLink = Q("#temp-download");
			downloadLink.download = "fencer.ttf";
			downloadLink.href = "data:font/ttf;base64," + uint8ArrayToBase64(uint8);
		}

	}

}

// function to create a new SamsaBuffer containing a binary font from an existing SamsaFont, but where tables can be inserted and deleted
// - <font> is a SamsaFont object with a tableList property
// - <inserts> is an object with each key being a table tag, each value being the SamsaBuffer of the binary contents
// - <deletes> is an object with each key being a table tag (value is ignored)
function exportFontWithTables(font, inserts={}, deletes={}) {

	//inserts = {};
	//deletes = {avar: true};

	function paddedLength(length) {
		return length + (4 - length%4) % 4
	}

	const newTables = font.tableList
						.map(table => { return { tag: table.tag, checkSum: 0, offset: 0, length: table.length, buffer: table.buffer } } )
						.filter(table => !deletes[table.tag] && !inserts[table.tag]);

	Object.keys(inserts).forEach(tag => newTables.push({ tag: tag, checkSum: 0, offset: 0, length: inserts[tag].byteLength, buffer: inserts[tag] }));
	const newFontSize = 12 + 16 * newTables.length + newTables.reduce((acc, table) => acc + paddedLength(table.length), 0);
	const newFontBuf = new SamsaBuffer(new ArrayBuffer(newFontSize)); // allocate memory for the new font
	// console.log("newTables");
	// console.log(newTables);

	// write first 12 bytes
	newFontBuf.u32 = font.header.sfntVersion;
	newFontBuf.u16_array = [newTables.length, ...font.binarySearchParams(newTables.length)]; // 1+3 U16 values
	newFontBuf.seekr(newTables.length * 16); // skip the table directory

	// write tables
	//newTables.forEach(table => newFontBuf.memcpy(table.buffer, table.offset = newFontBuf.tell(), 0, -1, 4)); // -1 means use the length of table.buffer, 4 means pad to modulo 4

	newTables.forEach(table => newFontBuf.memcpy(table.buffer, table.offset = newFontBuf.tell(), undefined, undefined, 4));



		//newFontBuf.memcpy(table.buffer, table.offset = newFontBuf.tell(), 0, table.length);
		// newFontBuf.memcpy(table.buffer, table.offset = newFontBuf.tell(), 0, -1, 4); // -1 means use the length of table.buffer, 4 means pad to modulo 4
		// newFontBuf.seekr(table.length);
		// newFontBuf.padToModulo(4);
	//});
	console.assert(newFontBuf.tell() === newFontSize, `The new font size (${newFontBuf.tell()}) and expected size (${newFontSize}) do not match.`);

	// write table directory
	newFontBuf.seek(12);
	newTables
		.sort((a,b) => { if (a.tag < b.tag) return -1; if (a.tag > b.tag) return 1; return 0; }) // sort by tag
		.forEach(table => newFontBuf.u32_array = newFontBuf.tableDirectoryEntry(table)); // write 4 U32 values for each table
	newFontBuf.seek(0);
	return newFontBuf;
}


function updateMappingsSliders(m) {

	Qall("#axes .axis").forEach((axisEl, a) => {
		const inputSliderEl = axisEl.querySelector(".input.slider");
		const inputNumericEl = axisEl.querySelector(".input.numeric");
		const outputSliderEl = axisEl.querySelector(".output.slider");
		const outputNumericEl = axisEl.querySelector(".output.numeric");

		inputSliderEl.value = inputNumericEl.value = (m === -1) ? GLOBAL.current[0][a] : GLOBAL.mappings[m][0][a];
		outputSliderEl.value = outputNumericEl.value = (m === -1) ? GLOBAL.current[1][a] : GLOBAL.mappings[m][1][a];
	});

	if (GLOBAL.draggingIndex === -1) {
		// disable all the outputs
		Qall("#axes .axis input.output").forEach(el => el.disabled = true);
	}
	else {
		// enable all the outputs
		Qall("#axes .axis input.output").forEach(el => el.disabled = false);
	}

}



function selectAxisControls(e) {

	//alert ("selectAxisControls");

	// const selectEl = Q("#select-axis-controls");
	// selectEl.value = GLOBAL.draggingIndex;

	mappingsSelectorPopulate();

}

function initFencer() {

	console.log("GLOBAL")

	const fontinfo = Q(".fontinfo");
	fontinfo.addEventListener("dragover", (event) => {
		// prevent default to allow drop
		event.preventDefault();
	});

	fontinfo.addEventListener("drop", onDropFont);

	// init the svg
	GLOBAL.svgEl = SVG("svg");
	GLOBAL.svgEl.id = "mappings-visual";
	GLOBAL.svgEl.setAttribute("transform", "scale(1 -1)");
	
	Q("#mapping-selector").onchange = selectAxisControls;
	Q(".mappings-ui").insertBefore(GLOBAL.svgEl, Q("#mappings-ui-info"));
	Q("#sample-text").oninput = sampleTextChange; // handle change of sample text
	Q("#mapping-selector").onchange = selectMapping; // handle change of mappings selector
	Q("#add-render").onclick = addRender;

	// show/hide XML
	Q("button#toggle-xml").onclick = e => {
		Q(".mappings .html").classList.toggle("hidden");
		Q(".mappings .xml").classList.toggle("hidden");
	};

	// load initial font
	// const filename = "RobotoA2-avar2-VF.ttf";
	const filename = "SofiaSans-VF.ttf";
	const filepath = "../fonts/" + filename;
	fetch(filepath)
		.then(response => response.arrayBuffer())
		.then(arrayBuffer => {
			loadFontFromArrayBuffer(arrayBuffer, {filename: filename});
		});
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
					const valueEl = axisEl.querySelector(".value");
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

