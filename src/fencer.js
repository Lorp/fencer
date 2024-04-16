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
const svgArrowLineWidth = 2;
const svgArrowHead = `<circle cx="0" cy="0" r="${svgArrowHandleRadius}" fill="#0003" stroke="currentColor" stroke-width="${svgArrowLineWidth}"/><circle cx="0" cy="0" r="5" fill="currentColor" stroke="none"/>`;
const svgArrowTail = `<circle cx="0" cy="0" r="${svgArrowHandleRadius}" fill="#0003" stroke="currentColor" stroke-width="${svgArrowLineWidth}"/><line x1="${-svgArrowHandleRadiusRoot2}" y1="${-svgArrowHandleRadiusRoot2}" x2="${svgArrowHandleRadiusRoot2}" y2="${svgArrowHandleRadiusRoot2}" stroke="currentColor" stroke-width="${svgArrowLineWidth}"/><line x1="${-svgArrowHandleRadiusRoot2}" y1="${svgArrowHandleRadiusRoot2}" x2="${svgArrowHandleRadiusRoot2}" y2="${-svgArrowHandleRadiusRoot2}" stroke="currentColor" stroke-width="${svgArrowLineWidth}"/>`;

const GLOBAL = {
	svgElWidth: 400,
	mappings: [],
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

function setMode(e) {

	GLOBAL.mode = document.querySelector("#select-mode").value;
	switch (GLOBAL.mode) {
		case "axes":
			Qall(".axis .output").forEach(el => el.disabled = true);
			break;

		case "mappings":
			Qall(".axis .output").forEach(el => el.disabled = false);
			break;

		default:
			break;
	}
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
	console.log(GLOBAL.font.fvar.axes)
	console.log(a);
	console.log("---");

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

		const downloadFontEl = document.querySelector("#download-font");
		downloadFontEl.disabled = false;
		const addMappingButtonEl = document.querySelector("#add-mapping");
		addMappingButtonEl.disabled = false;

	});

	// build axis controls
	str += "AXES: \n";
	GLOBAL.font.fvar.axes.forEach(axis => {
		str += `${axis.axisTag} ${axis.minValue} ${axis.defaultValue} ${axis.maxValue}\n`;
	});
	// document.querySelector(".fontinfo textarea").value = str; // set the textarea content to the string


	// add key

	const keyEl = EL("div");
	keyEl.classList.add("key");
	const key = [ EL("div"), EL("div"), EL("div"), EL("div"), EL("div"), EL("div") ];
	key[0].textContent = "tag";
	key[1].textContent = "v";
	key[2].textContent = "slider";
	key[3].style.fontFamily = "Material Symbols Outlined";
	key[3].textContent = "refresh";
	key[3].title = "reset all";
	key[3].onclick = axisReset;
	key[4].textContent = "x";
	key[5].textContent = "y";
	keyEl.append(...key);
	Q("#axes").append(keyEl);

	
	// tag value slider reset check check
	GLOBAL.font.fvar.axes.forEach((axis, a) => {
		const axisEl = EL("div");
		axisEl.classList.add("axis");
		axisEl.dataset.axisId = a;

		const row = [ EL("input"), EL("div"), EL("div"), EL("div"), EL("input"), EL("input") ];

		row[0].value = axis.axisTag;
		row[0].classList.add("monospace");
		row[0].disabled = true;
		row[0].title = `${axis.axisTag} (${GLOBAL.font.names[axis.axisNameID]})\nmin: ${axis.minValue}\ndefault: ${axis.defaultValue}\nmax: ${axis.maxValue}`;

		// input/output numerics
		const inNumEl = EL("input");
		const outNumEl = EL("input");
		inNumEl.value = axis.defaultValue;
		inNumEl.classList.add("input", "numeric");
		outNumEl.value = axis.defaultValue;
		outNumEl.classList.add("output", "numeric");
		row[1].append(inNumEl, outNumEl);

		// input/output sliders
		const inEl = EL("input");
		inEl.type = "range";
		inEl.style.width = "100%";
		inEl.min = axis.minValue;
		inEl.max = axis.maxValue;
		inEl.value = axis.defaultValue;
		inEl.step = "0.001";
		inEl.classList.add("slider", "input", "slider");
		inEl.oninput = axisSliderChange;

		const outEl = EL("input");
		outEl.type = "range";
		outEl.style.width = "100%";
		outEl.min = axis.minValue;
		outEl.max = axis.maxValue;
		outEl.value = axis.defaultValue;
		outEl.step = "0.001";
		outEl.classList.add("slider", "output", "slider");
		outEl.oninput = axisSliderChange;


		row[2].append(inEl, outEl);
		// row[2].type = "range"; row[2].min = axis.minValue; row[2].max = axis.maxValue; row[2].value = axis.defaultValue; row[2].step = "0.001";
		// row[2].classList.add("slider");
		// row[2].oninput = axisSliderChange;

		row[3].style.fontFamily = "Material Symbols Outlined";
		row[3].textContent = "refresh";
		row[3].onclick = axisReset;
		row[3].title = "reset";

		row[4].type = "radio";
		row[4].name = "x-axis";
		row[4].value = a;
		//row[4].classList.add("x-axis");
		row[4].checked = (a==0);
		row[4].onchange = axisCheckboxChange;

		row[5].type = "radio";
		row[5].name = "y-axis";
		row[5].value = a;
		//row[5].classList.add("y-axis");
		row[5].checked = (a==1);
		row[5].onchange = axisCheckboxChange;

		axisEl.append(...row);

		Q("#axes").append(axisEl);
	});

	// set initial mode to "axes", make the output axes disabled
	setMode();

	function axisSliderChange (e) {

		// which mode are we in? "font" or "mapping"
		// - mapping mode
		if (GLOBAL.mode === "mapping") {


		}

		// - font mode
		else {
			if (e.target.classList.contains("input")) {
				const el = e.target;
				const axisEl = el.closest(".axis");
				axisEl.querySelector(".input.numeric").value = el.value;
				updateRenders();
			}
			// output sliders are disabled
		}

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

		// is is the reset button in an axis row?
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

	/*
	// init x-axis-select and y-axis-select select elements
	const xAxisSelectEl = document.querySelector("#x-axis-select");
	const yAxisSelectEl = document.querySelector("#y-axis-select");
	xAxisSelectEl.innerHTML = "";
	yAxisSelectEl.innerHTML = "";
	GLOBAL.font.fvar.axes.forEach(axis => {
		const xOption = EL("option", {value: axis.axisTag});
		const yOption = EL("option", {value: axis.axisTag});
		xOption.textContent = axis.axisTag;
		yOption.textContent = axis.axisTag;
		xAxisSelectEl.append(xOption);
		yAxisSelectEl.append(yOption);
	});
	*/

	// // init global axis values
	// GLOBAL.axisValues = [];
	// GLOBAL.font.fvar.axes.forEach(axis => {
	// 	axisValues.push(axis.defaultValue);
	// });

	// draw mappings SVG
	updateMappingsSVG();
	updateRenders();

}

function onDropFont (e) {
	const el = e.target;

	e.preventDefault();

	// open font as SamsaFont
	// - not yet


	// get arrayBuffer from dropped object
	const file = e.dataTransfer.files[0];
	file.arrayBuffer().then(arrayBuffer => {

		loadFontFromArrayBuffer(arrayBuffer);

	});
}


function getCurrentAxisValues() {

	return GLOBAL.font.fvar.axes.map((axis, a) => {
		const axisEl = Qall(".axis")[a];
		return parseFloat(axisEl.querySelector(".input").value);
	});
}


function getDefaultAxisValues() {

	return GLOBAL.font.fvar.axes.map((axis, a) => {
		return axis.defaultValue;
	});
}

function addRender() {

	const currentAxisValues = getCurrentAxisValues();
	
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
		valueEl.value = currentAxisValues[a];

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


	refreshResults();
	
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
	const currentCoords = getCurrentAxisValues();

	// initialize the mapping to the default values
	GLOBAL.font.fvar.axes.forEach((axis, a) => {
		from.push(currentCoords[a]);
		to.push(currentCoords[a]);
	});

	GLOBAL.mappings.push([from, to]);

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

	return arrowSvg;
}

function svgMouseMove(e) {

	e.stopPropagation();

	const el = GLOBAL.dragging;
	const index = parseInt(el.dataset.index);
	const mapping = GLOBAL.mappings[index];
	const rect = GLOBAL.svgEl.getBoundingClientRect();

	// get the transform attribute of the element
	const transform = el.getAttribute("transform");
	const coords = transform.match(/translate\(([^)]+),\s*([^)]+)\)/); // parse float in JS, not regex
	const elX = parseFloat(coords[1]);
	const elY = parseFloat(coords[2]);

	const mousex = e.clientX;
	const mousey = rect.height - e.clientY;
	const x = mousex - rect.left;
	const y = mousey + rect.top;
	const svgX = x - GLOBAL.dragOffset[0];
	const svgY = y - GLOBAL.dragOffset[1];

	el.setAttribute("transform", `translate(${svgX}, ${svgY})`);

	// recalculate the mapping
	const xAxisEl = Q("input[name=x-axis]:checked").closest(".axis");
	const yAxisEl = Q("input[name=y-axis]:checked").closest(".axis");
	const xAxisIndex = parseInt(xAxisEl.dataset.axisId);
	const yAxisIndex = parseInt(yAxisEl.dataset.axisId);

	// look for the line with this index
	const arrowEl = [...Qall(".arrow")].find(arrowEl => parseInt(arrowEl.dataset.index) === index);
	if (arrowEl) {
		const lineEl = arrowEl.querySelector("line");
		if (el.classList.contains("input")) {
			lineEl.attr({x1: svgX, y1: svgY});
			mapping[0][xAxisIndex] = axisCoordFromSvgCoord(xAxisIndex, svgX);
			mapping[0][yAxisIndex] = axisCoordFromSvgCoord(yAxisIndex, svgY);
		}
		else if (el.classList.contains("output")) {
			lineEl.attr({x2: svgX, y2: svgY});
			mapping[1][xAxisIndex] = axisCoordFromSvgCoord(xAxisIndex, svgX);
			mapping[1][yAxisIndex] = axisCoordFromSvgCoord(yAxisIndex, svgY);
		}
		
		updateMappingsSliders(index);
		updateMappings();
	}

}

function svgMouseUp(e) {
	e.stopPropagation();

	const rect = GLOBAL.svgEl.getBoundingClientRect();
	const x = e.clientX;
	const y = e.clientY;

	GLOBAL.svgEl.removeEventListener("mousemove", svgMouseMove); // = undefined;
	GLOBAL.svgEl.removeEventListener("onmouseup", svgMouseUp); // = undefined;
	GLOBAL.dragging = undefined;
	GLOBAL.dragOffset = undefined;

}

function mappingMouseDown (e) {

	// if we hit the line, propagate the event
	if (!e.target.closest("g.location")) {
		return false;
	}

	// we hit a location
	e.stopPropagation();

	const rect = GLOBAL.svgEl.getBoundingClientRect();
	const x = e.clientX;
	const y = e.clientY;

	const el = e.target.closest("g.location");

	const transform = el.getAttribute("transform");
	const coords = transform.match(/translate\(([^)]+),\s*([^)]+)\)/); // parse float in JS, not regex

	const mousex = e.clientX;
	const mousey = rect.height - e.clientY;

	const svgX = mousex - rect.left;
	const svgY = mousey + rect.top;

	const dx = svgX - coords[1];
	const dy = svgY - coords[2];

	GLOBAL.dragOffset = [dx, dy];
	GLOBAL.dragging = el;

	GLOBAL.svgEl.addEventListener("mousemove", svgMouseMove);
	GLOBAL.svgEl.addEventListener("mouseup", svgMouseUp);

}

function updateMappingsSVG() {

//	console.log(GLOBAL);
	GLOBAL.svgEl.innerHTML = "";

	// draw x=0 and y=0 lines
	const svgOriginCoords = svgCoordsFromAxisCoords(getDefaultAxisValues());
	

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
	
	
		// function translationFromViewAxisValues () {
	
		// 	const svgElWidth = 400;
		// 	let x,y;
		// 	mappingsView.forEach((axis, v) => {
		// 		const value = (axis.defaultValue - axis.minValue) / (axis.maxValue - axis.minValue) * svgElWidth;
		// 		if (v==0)
		// 			x = value;
		// 		else if (v==1)
		// 			y = value;
		// 	});
	
		// 	return [x, y];
		// }
	
		//const delta = translationFromViewAxisValues();
	
	
		//const svgCoords = svgCoordsFromAxisCoords(0,0);
		//const svgCoords = svgCoordsFromAxisCoords(getCurrentAxisValues());

		const svgCoordsFrom = svgCoordsFromAxisCoords(mapping[0]);
		const svgCoordsTo = svgCoordsFromAxisCoords(mapping[1]);

		// elFrom.attr({transform: translationFromViewAxisValues()});
		// elTo.attr({transform: translationFromViewAxisValues()});
	
		elInput.attr({transform: `translate(${svgCoordsFrom[0]}, ${svgCoordsFrom[1]})`});
		elOutput.attr({transform: `translate(${svgCoordsTo[0]}, ${svgCoordsTo[1]})`});
	
		GLOBAL.svgEl.appendChild(elInput);
		GLOBAL.svgEl.appendChild(elOutput);

		// draw the arrow
		const arrowSvg = svgArrow(m, svgCoordsFrom[0], svgCoordsFrom[1], svgCoordsTo[0], svgCoordsTo[1]);
		GLOBAL.svgEl.appendChild(arrowSvg);
	
	});

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

	Qall(".axis").forEach((axisEl, a) => {
		const inputSliderEl = axisEl.querySelector(".input.slider");
		const outputSliderEl = axisEl.querySelector(".output.slider");

		inputSliderEl.value = GLOBAL.mappings[m][0][a];
		outputSliderEl.value = GLOBAL.mappings[m][1][a];
	});
}


function initFencer() {

	console.log("GLOBAL")

	const fontinfo = document.querySelector(".fontinfo");
	fontinfo.addEventListener("dragover", (event) => {
		// prevent default to allow drop
		event.preventDefault();
	});

	fontinfo.addEventListener("drop", onDropFont);


	document.querySelector("#select-mode").onchange = setMode;

	// init the svg
	GLOBAL.svgEl = SVG("svg");
	GLOBAL.svgEl.id = "mappings-visual";
	GLOBAL.svgEl.setAttribute("transform", "scale(1 -1)");
	
	// init the mappings xml
	updateMappings();

	// on add mapping button click
	const addMappingButtonEl = document.querySelector("#add-mapping");
	addMappingButtonEl.onclick = e => {
		addMapping();
	};

	Q(".mappings-ui").insertBefore(GLOBAL.svgEl, Q("#mappings-ui-info"));
	//Q(".mappings-ui").append(GLOBAL.svgEl);

	Q("#sample-text").oninput = sampleTextChange;
	

	//const svgEl = document.querySelector(".mappings-svg");

	Q("#add-render").onclick = addRender;

	// show/hide XML
	Q("button#toggle-xml").onclick = e => {
		Q(".mappings .html").classList.toggle("hidden");
		Q(".mappings .xml").classList.toggle("hidden");
	};


	// get initial font
	const filename = "RobotoA2-avar2-VF.ttf"
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
		if (r==0){
			Qall("#axes .axis").forEach(axisEl => {
				const axisId = parseInt(axisEl.dataset.axisId);
				const axis = GLOBAL.font.fvar.axes[axisId];
				const value = axisEl.querySelector(".input.numeric").value;
				fvsEntries.push(`"${axis.axisTag}" ${value}`);
			});		
		}
		else {
			const axisValues = getCurrentAxisValues();
			const axisEls = renderItemEl.querySelectorAll(".axis");
			axisEls.forEach((axisEl, a) => {
				const axis = GLOBAL.font.fvar.axes[a];
				const valueEl = axisEl.querySelector(".value");
				if (!axisEl.classList.contains("locked")) {
					valueEl.value = axisValues[a]; // if unlocked, update it to the current axis value
				}
				fvsEntries.push(`"${axis.axisTag}" ${valueEl.value}`);
			});
		}
		renderEl.style.fontVariationSettings = fvsEntries.join();
	});
}



initFencer();

