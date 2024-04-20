"use strict"

// import samsa-core and fontTools.varLib models
import { SamsaFont, SamsaInstance, SamsaBuffer, SAMSAGLOBAL } from "https://lorp.github.io/samsa-core/src/samsa-core.js";
import { normalizeValue, piecewiseLinearMap } from "./models.js";



//console.log(piecewiseLinearMap)


let mappingsSVG;
const mappingsView = [];
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

Element.prototype.attr = function (attrs) {
	for (const prop in attrs) {
		this.setAttributeNS(null, prop, attrs[prop])
	}
}

Element.prototype.setPosition = function (position) {
	this.setAttribute("transform", `translate(${position[0]}, ${position[1]})`)
}


function axisControlSelectorPopulate() {

	const selectEl = Q("#select-axis-controls");

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

function setAxisControls(mappingIndex) {
	
	if (mappingIndex === undefined || mappingIndex === -1) {

	}
	else {


	}


}

function setMode(e) {

	GLOBAL.mode = Q("#select-mode").value;
	switch (GLOBAL.mode) {
		case "axes":
			Qall("#axes .axis .output").forEach(el => el.disabled = true);
			break;

		case "mappings":
			Qall("#axes .axis .output").forEach(el => el.disabled = false);
			break;

		default:
			break;
	}
}

function getArrowPath (arrow) {

	// call with getArrowParams({x1: x1, x2: x2, y1: y1, y2: y2, tipLen: tipLen, tipWid: tipWid})

	const x1 = arrow.x1, y1 = arrow.y1, x2 = arrow.x2, y2 = arrow.y2;
	const tipLen = arrow.tipLen, tipWid = arrow.tipWid;
	const points = [];

	if (x2!=x1 || y2!=y1) {
		const len = Math.sqrt((x2-x1)*(x2-x1)+(y2-y1)*(y2-y1));
		const arrowBackX = (y2-y1) * tipWid/2/len, arrowBackY = (x2-x1) * tipWid/2/len;

		console.log(arrow)
		console.log("len", len)

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

	const a0 = coords[mappingsView[0]];
	const a1 = coords[mappingsView[1]];

	const s0 = svgCoordFromAxisCoord(mappingsView[0], a0);
	const s1 = svgCoordFromAxisCoord(mappingsView[1], a1);

	return [s0, s1];
}

function loadFontFromArrayBuffer (arrayBuffer, options={}) {

	//RobotoA2-avar1-VF.ttf

	GLOBAL.font = new SamsaFont(new SamsaBuffer(arrayBuffer));
	let str = "";

	// filename, font name
	str += options.filename ?? "" + "\n";
	str += GLOBAL.font.names[6] + "\n";
	str += "---\n";

	// set the font face to the arraybuffer
	const fontFace = new FontFace(GLOBAL.font.names[6], arrayBuffer);
	fontFace.load().then(loadedFace => {

		document.fonts.add(loadedFace);
		const renderEls = Qall(".render");

		// locked axes are stored in dataset
		renderEls.forEach(renderEl => {
			renderEl.style.fontFamily = GLOBAL.font.names[6];
		});

		//		console.log("loaded font: " + GLOBAL.font.names[6]);

		const downloadFontEl = Q("#download-font");
		downloadFontEl.disabled = false;
		const addMappingButtonEl = Q("#add-mapping");
		addMappingButtonEl.disabled = false;

	});


	// axis-controls-select

	axisControlSelectorPopulate();

	// build axis controls
	str += "AXES: \n";
	GLOBAL.font.fvar.axes.forEach(axis => {
		str += `${axis.axisTag} ${axis.minValue} ${axis.defaultValue} ${axis.maxValue}\n`;
	});
	// document.querySelector(".fontinfo textarea").value = str; // set the textarea content to the string


	// add key

	const keyEl = EL("div");
	keyEl.classList.add("key");
	const key = [ EL("div"), EL("div"), EL("div"), EL("div"), EL("div"), EL("div"), EL("div"), EL("div"), EL("div") ];
	key[0].textContent = "TAG";
	key[1].textContent = "IN";
	key[2].textContent = "IN";
	key[3].textContent = "→";
	key[4].textContent = "OUT";
	key[5].textContent = "OUT";
	key[6].textContent = "refresh";
	key[7].textContent = "X";
	key[8].textContent = "Y";
	key[6].style.fontFamily = "Material Symbols Outlined";
	key[6].title = "reset all";
	key[6].onclick = axisReset;
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
		row[0].title = `${axis.axisTag} (${GLOBAL.font.names[axis.axisNameID]})\nmin: ${axis.minValue}\ndefault: ${axis.defaultValue}\nmax: ${axis.maxValue}`;

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
		row[6].title = "reset";

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
		console.log(inputOrOutput);
		const inputOrOutputId = (inputOrOutput === "input") ? 0 : 1;

		const elMarker = (GLOBAL.draggingIndex === -1) ? Q("g.current") : Q(`g.location.${inputOrOutput}[data-index="${GLOBAL.draggingIndex}"]`);
		const el = e.target;
		const axisEl = el.closest(".axis");
		const axisId = parseInt(axisEl.dataset.axisId);
		const otherInputEl = el.classList.contains("slider") ? axisEl.querySelector(".input.numeric") : axisEl.querySelector(".input.slider");
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

		/*
		if (GLOBAL.draggingIndex === -1) {

			// hack (set output = input)
			// FIX THIS WHEN avar2 COMPILATION WORKING
			axisEl.querySelectorAll("input.output").forEach(outputEl => outputEl.value = parseFloat(el.value));

		}

		// move the arrow
		if (GLOBAL.draggingIndex !== -1) {

			const mapping = GLOBAL.mappings[GLOBAL.draggingIndex];
			const [svgX, svgY] = svgCoordsFromAxisCoords(mapping[inputOrOutputId]);
			
			// update the arrow
			const arrowEl = Q(`.arrow[data-index="${GLOBAL.draggingIndex}"]`);
			if (arrowEl) { // sanity

				updateArrow(arrowEl, inputOrOutputId, svgX, svgY);

			}

		}
		*/


	

		updateRenders();
	}

	function axisReset (e) {
		const el = e.target;
		const parentEl = el.closest(".axis,.key");

		// is the reset button in the key row?
		if (parentEl.classList.contains("key")) {
			Qall("#axes .axis").forEach(axisEl => {
				const axis = GLOBAL.font.fvar.axes[parseInt(axisEl.dataset.axisId)];
				axisEl.querySelectorAll("input.input, input.output").forEach( el => el.value = axis.defaultValue );
			});
		}

		// is the reset button in an axis row?
		else {
			const axisEl = parentEl;
			const axis = GLOBAL.font.fvar.axes[parseInt(axisEl.dataset.axisId)];
			axisEl.querySelectorAll("input.input, input.output").forEach( el => el.value = axis.defaultValue );
		}

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
				mappingsView[0] = a;

			if (axisEl.querySelector("input[name=y-axis]").checked)
				mappingsView[1] = a;
		});


		// redraw the mappings SVG
		// - TODO: decide if we need to update the mappingsView array
		updateMappingsSVG();
	}
	
	
	// init mappings SVG based on first two axes
	mappingsView.length = 0;
	if (GLOBAL.font.fvar.axes.length > 0) {
		mappingsView.push(0); // set x axis to the first axis
		if (GLOBAL.font.fvar.axes.length > 1) {
			mappingsView.push(1); // set y axis to the second axis
		}
	}

	// draw mappings SVG
	updateMappingsSVG();
	updateRenders();

	// disable all the initial outputs
	if (GLOBAL.draggingIndex === -1) {
		Qall("#axes .axis input.output").forEach(el => el.disabled = true);
	}

}

function onDropFont (e) {
	const el = e.target;

	e.preventDefault();

	// get arrayBuffer from dropped object
	const file = e.dataTransfer.files[0];
	file.arrayBuffer().then(arrayBuffer => {

		loadFontFromArrayBuffer(arrayBuffer);

	});
}


function getCurrentAxisCoords() {

	return GLOBAL.font.fvar.axes.map((axis, a) => {
		const axisEl = Qall("#axes .axis")[a];
		return parseFloat(axisEl.querySelector(".input").value);
	});
}


function getDefaultAxisCoords() {

	return GLOBAL.font.fvar.axes.map((axis, a) => {
		return axis.defaultValue;
	});
}

function addRender() {

	//const currentAxisCoords = getCurrentAxisCoords();
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
	renderEl.style.fontFamily = GLOBAL.font.names[6];
	
	renderItemEl.append(renderEl, controlsEl, controlsButtonEl);

	Q(".render-container").append(renderItemEl);


	//refreshResults();
	
}

function lockElclick(e) {
	const lockEl = e.target;
	//lockEl.classList.toggle("locked");

	lockEl.closest(".axis").classList.toggle("locked");
	refreshResults();
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
	//const currentCoords = getCurrentAxisCoords();
	const currentCoords = GLOBAL.current[0];

	// initialize the mapping to the default values
	GLOBAL.font.fvar.axes.forEach((axis, a) => {
		from.push(currentCoords[a]);
		to.push(currentCoords[a]);
	});

	GLOBAL.mappings.push([from, to]);

	axisControlSelectorPopulate();

	// update stuff
	updateMappingsSVG();
	updateMappings();
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


	// which axes are we using?
	const xAxisEl = Q("input[name=x-axis]:checked").closest(".axis");
	const yAxisEl = Q("input[name=y-axis]:checked").closest(".axis");
	const xAxisIndex = parseInt(xAxisEl.dataset.axisId);
	const yAxisIndex = parseInt(yAxisEl.dataset.axisId);

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
	const [xCoord, yCoord] = [axisCoordFromSvgCoord(xAxisIndex, svgX), axisCoordFromSvgCoord(yAxisIndex, svgY)];



	if (index === -1) { // current location
		// it’s the current location marker

		// input
		GLOBAL.current[0][xAxisIndex] = xCoord;
		GLOBAL.current[0][yAxisIndex] = yCoord;

		// output
		GLOBAL.current[1][xAxisIndex] = xCoord;
		GLOBAL.current[1][yAxisIndex] = yCoord;

		updateMappingsSliders(index);
	}

	else {
		// it’s a mapping location marker

		const mapping = GLOBAL.mappings[index];

		// look for the line with this index
		//const arrowEl = [...Qall(".arrow")].find(arrowEl => parseInt(arrowEl.dataset.index) === index);
		const arrowEl = Q(`.arrow[data-index="${index}"]`);
		if (arrowEl) { // sanity

			let inputOrOutputId;
			if (el.classList.contains("input"))
				inputOrOutputId = 0;
			else if (el.classList.contains("output"))
				inputOrOutputId = 1;

			updateArrow(arrowEl, inputOrOutputId, svgX, svgY);

			// const lineEl = arrowEl.querySelector("line");
			// const pathEl = arrowEl.querySelector("path");
			// let x1 = parseFloat(lineEl.getAttribute("x1"));
			// let y1 = parseFloat(lineEl.getAttribute("y1"));
			// let x2 = parseFloat(lineEl.getAttribute("x2"));
			// let y2 = parseFloat(lineEl.getAttribute("y2"));
			// const pathStr = getArrowPath({x1: x1, x2: x2, y1: y1, y2: y2, tipLen: 20, tipWid: 15});
			// pathEl.attr({d: pathStr});


			if (el.classList.contains("input")) {
				// x1 = svgX;
				// y1 = svgY;
				// lineEl.attr({x1: x1, y1: y1});
				mapping[0][xAxisIndex] = xCoord;
				mapping[0][yAxisIndex] = yCoord;
			}
			else if (el.classList.contains("output")) {
				// x2 = svgX;
				// y2 = svgY;
				// lineEl.attr({x2: x2, y2: y2});
				mapping[1][xAxisIndex] = xCoord;
				mapping[1][yAxisIndex] = yCoord;
			}
			
			updateMappingsSliders(index);
			updateMappings();
		}
	}

	// 
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
	GLOBAL.dragging = undefined;
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
	Q("#select-axis-controls").value = GLOBAL.draggingIndex;
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
	//elCurrent.setPosition(svgCoordsFromAxisCoords(getCurrentAxisCoords()));
	elCurrent.setPosition(svgCoordsFromAxisCoords(GLOBAL.current[0]));
	GLOBAL.svgEl.appendChild(elCurrent);
	elCurrent.onmousedown = mappingMouseDown;
	elCurrent.onmousedown = mappingMouseDown;

	
}




function updateMappings() {

	// update XML
	let str = "<mappings>\n";
	GLOBAL.mappings.forEach(mapping => {
		str += `  <mapping>\n`;
		["input","output"].forEach((io, i) => {
			str += `    <${io}>\n`;
			mapping[i].forEach((x, a) => {
				const axis = GLOBAL.font.fvar.axes[a];
				if (x !== undefined && axis.defaultValue !== x)
					str += `      <dimension tag="${GLOBAL.font.fvar.axes[a].axisTag}" xvalue="${x}">\n`;
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

	axisControlSelectorPopulate();

}

function initFencer() {

	console.log("GLOBAL")

	const fontinfo = Q(".fontinfo");
	fontinfo.addEventListener("dragover", (event) => {
		// prevent default to allow drop
		event.preventDefault();
	});

	fontinfo.addEventListener("drop", onDropFont);


	//document.querySelector("#select-mode").onchange = setMode;

	Q("#select-axis-controls").onchange = selectAxisControls;


	// init the svg
	GLOBAL.svgEl = SVG("svg");
	GLOBAL.svgEl.id = "mappings-visual";
	GLOBAL.svgEl.setAttribute("transform", "scale(1 -1)");
	
	// init the mappings xml
	updateMappings();

	// on add mapping button click
	const addMappingButtonEl = Q("#add-mapping");
	addMappingButtonEl.onclick = e => {
		addMapping();
	};

	Q(".mappings-ui").insertBefore(GLOBAL.svgEl, Q("#mappings-ui-info"));
	//Q(".mappings-ui").append(GLOBAL.svgEl);

	Q("#sample-text").oninput = sampleTextChange;

	// handle change of mappings selector
	Q("#select-axis-controls").onchange = selectMapping;
	

	//const svgEl = document.querySelector(".mappings-svg");

	Q("#add-render").onclick = addRender;

	// show/hide XML
	Q("button#toggle-xml").onclick = e => {
		Q(".mappings .html").classList.toggle("hidden");
		Q(".mappings .xml").classList.toggle("hidden");
	};

	// load initial font
	const filename = "RobotoA2-avar2-VF.ttf";
	const filepath = "../fonts/" + filename;
	fetch(filepath)
		.then(response => response.arrayBuffer())
		.then(arrayBuffer => {
			loadFontFromArrayBuffer(arrayBuffer, {filename: "RobotoA2-avar1-VF.ttf"});
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
	console.log("selectMapping", GLOBAL.draggingIndex);
	updateMappingsSliders(GLOBAL.draggingIndex);

}

initFencer();

