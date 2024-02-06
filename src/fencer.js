"use strict"

// import samsa-core and fontTools.varLib models
import { SamsaFont, SamsaInstance, SamsaBuffer, SAMSAGLOBAL } from "https://lorp.github.io/samsa-core/src/samsa-core.js";
import { normalizeValue, piecewiseLinearMap } from "./models.js";



//console.log(piecewiseLinearMap)


let mappingsSVG;
const mappings = [];
const mappingsView = [];
const svgPre = `<svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">`;
const svgPost = `</svg>`;
const svgArrowHead = `<circle cx="0" cy="0" r="45" fill="none" stroke="currentColor" stroke-width="10"/><circle cx="0" cy="0" r="5" fill="currentColor" stroke="none"/>`;
const svgArrowTail = `<circle cx="0" cy="0" r="45" fill="none" stroke="currentColor" stroke-width="10"/><line x1="0" y1="-45" x2="0" y2="45" stroke="currentColor" stroke-width="10"/><line x1="-45" y1="0" x2="45" y2="0" stroke="currentColor" stroke-width="10"/>`;

const GLOBAL = {};

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


function onDropFont (e) {
	const el = e.target;

	e.preventDefault();

	// open font as SamsaFont
	// - not yet


	// get arrayBuffer from dropped object
	const file = e.dataTransfer.files[0];
	file.arrayBuffer().then(arrayBuffer => {
		GLOBAL.font = new SamsaFont(new SamsaBuffer(arrayBuffer));
		let str = "";

		// filename, font name
		str += file.name + "\n";
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

			const row = [ EL("input"), EL("input"), EL("input"), EL("div"), EL("input"), EL("input") ];

			row[0].value = axis.axisTag;
			row[0].classList.add("monospace");
			row[0].disabled = true;
			row[0].title = `${axis.axisTag} (${GLOBAL.font.names[axis.axisNameID]})\nmin: ${axis.minValue}\ndefault: ${axis.defaultValue}\nmax: ${axis.maxValue}`;

			row[1].value = axis.defaultValue;
			row[1].classList.add("axis-input");

			row[2].type = "range"; row[2].min = axis.minValue; row[2].max = axis.maxValue; row[2].value = axis.defaultValue; row[2].step = "0.001";
			row[2].classList.add("axis-slider");
			row[2].oninput = axisSliderChange;

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


		function axisSliderChange (e) {
			const el = e.target;
			const axisEl = el.closest(".axis");
			axisEl.querySelector(".axis-input").value = el.value;
			refreshResults();
		}

		function axisReset (e) {
			const el = e.target;
			const axisEl = el.closest(".axis,.key");

			if (axisEl.classList.contains("key")) {
				Qall("#axes .axis").forEach(axisEl => {
					const axis = GLOBAL.font.fvar.axes[parseInt(axisEl.dataset.axisId)];
					axisEl.querySelector(".axis-input").value = axis.defaultValue;
					axisEl.querySelector(".axis-slider").value = axis.defaultValue;	
				});
			}
			else {
				const axis = GLOBAL.font.fvar.axes[parseInt(axisEl.dataset.axisId)];
				axisEl.querySelector(".axis-input").value = axis.defaultValue;
				axisEl.querySelector(".axis-slider").value = axis.defaultValue;	
			}
			refreshResults();
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
						break;
					}
				}				
			}

			// redraw the mappings SVG
			// - TODO: decide if we need to update the mappingsView array
			updateMappingsSVG();
		}
		
		
		// init mappings SVG based on first two axes
		mappingsView.length = 0;
		if (GLOBAL.font.fvar.axes.length > 0) {
			mappingsView.push(GLOBAL.font.fvar.axes[0]); // set x axis to the first axis
			if (GLOBAL.font.fvar.axes.length > 1) {
				mappingsView.push(GLOBAL.font.fvar.axes[1]); // set y axis to the second axis
			}
		}

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

		// // init global axis values
		// GLOBAL.axisValues = [];
		// GLOBAL.font.fvar.axes.forEach(axis => {
		// 	axisValues.push(axis.defaultValue);
		// });

		// draw mappings SVG
		updateMappingsSVG();

		refreshResults();
	});
}


function getCurrentAxisValues() {

	return GLOBAL.font.fvar.axes.map((axis, a) => {
		const axisEl = Qall("#axes .axis")[a];
		return parseFloat(axisEl.querySelector(".axis-input").value);
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
		axisEl.classList.add("axis");

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
		lockEl.classList.add("lock", "locked"); // we remove the class "locked" when it is unlocked
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
	lockEl.classList.toggle("locked");
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

function addMapping() {

	const from = [];
	const to = [];
	const mapping = [from, to];

	GLOBAL.font.fvar.axes.forEach((axis, i) => {
		from.push(axis.defaultValue);
		to.push(axis.defaultValue);
	});

	console.log (mapping[0])
	console.log (mapping[0].length)


	mapping[0].forEach((x, i) => {
		console.log("YAY", x, i);
	});

	for (let i=0; i<mapping[0].length; i++) {
		console.log("YAY", i);
	}

	mappings.push(mapping);

	const elFrom = SVG("g");
	const elTo =   SVG("g");

	elFrom.classList.add("input");
	elTo.classList.add("output");

	elFrom.innerHTML = svgArrowTail
	elTo.innerHTML = svgArrowHead;


	function translationFromViewAxisValues () {

		const svgElWidth = 400;
		let x,y;
		mappingsView.forEach((axis, v) => {
			const value = (axis.defaultValue - axis.minValue) / (axis.maxValue - axis.minValue) * svgElWidth;
			if (v==0)
				x = value;
			else if (v==1)
				y = value;
		});

		return [x, y];
	}

	const delta = translationFromViewAxisValues();

	// elFrom.attr({transform: translationFromViewAxisValues()});
	// elTo.attr({transform: translationFromViewAxisValues()});

	elFrom.attr({transform: `translate(${delta[0]}, ${delta[1]})`});
	elTo.attr({transform: `translate(${delta[0]}, ${delta[1]})`});

	GLOBAL.svgEl.appendChild(elFrom);
	GLOBAL.svgEl.appendChild(elTo);

	// draw x=0 and y=0 lines
	const xAxisEl = SVG("line", {x1:0, y1:delta[1], x2:400, y2:delta[1], stroke: "grey"});
	const yAxisEl = SVG("line", {x1:delta[0], y1:0, x2:delta[0], y2:400, stroke: "grey"});
	GLOBAL.svgEl.appendChild(xAxisEl);
	GLOBAL.svgEl.appendChild(yAxisEl);


	updateMappingsXML();

}

function svgMouseMove(e) {
	const rect = GLOBAL.svgEl.getBoundingClientRect();
	const x = e.clientX;
	const y = e.clientY;
	console.log("MOUSE MOVE", x - rect.left, y - rect.top);

}


function updateMappingsSVG() {

	let svg = "";


}

function updateMappingsXML() {

	let str = "<mappings>\n";
	mappings.forEach(mapping => {
		str += `  <mapping>\n`;
		["input","output"].forEach((io, i) => {
			str += `    <${io}>\n`;
			mapping[i].forEach((x, a) => {
				if (x !== undefined)
					str += `      <dimension tag="${GLOBAL.font.fvar.axes[a].axisTag}" xvalue="${x}">\n`;
			});
			str += `    </${io}>\n`;
		});
		str += `  </mapping>\n`;
	});

	str += "</mappings>";
	Q(".mappings-xml textarea").value = str;
}

function initFencer() {

	const fontinfo = document.querySelector(".fontinfo");
	fontinfo.addEventListener("dragover", (event) => {
		// prevent default to allow drop
		event.preventDefault();
	});

	fontinfo.addEventListener("drop", onDropFont);


	// init the mappings xml
	updateMappingsXML();


	// on add mapping button click
	const addMappingButtonEl = document.querySelector("#add-mapping");
	addMappingButtonEl.onclick = e => {
		addMapping();
	};

	// init the svg
	GLOBAL.svgEl = SVG("svg");
	GLOBAL.svgEl.id = "mappings-visual";

	Q(".mappings-ui").insertBefore(GLOBAL.svgEl, Q("#mappings-ui-info"));
	//Q(".mappings-ui").append(GLOBAL.svgEl);

	// set up the mouse move event
	GLOBAL.svgEl.onmousemove = svgMouseMove;
	

	//const svgEl = document.querySelector(".mappings-svg");

	Q("#add-render").onclick = addRender;

}

function refreshResults() {

	// get the axis values

	// update all renders
	Qall(".render-item").forEach((renderItemEl, r) => {
		const renderEl = renderItemEl.querySelector(".render");
		const fvsEntries = [];
		if (r==0){
			Qall("#axes .axis").forEach(axisEl => {
				const axisId = parseInt(axisEl.dataset.axisId);
				const axis = GLOBAL.font.fvar.axes[axisId];
				const value = axisEl.querySelector(".axis-input").value;
				fvsEntries.push(`"${axis.axisTag}" ${value}`);
			});		
		}
		else {
			//const thisRenderVariationSettings = [];
			const axisValues = getCurrentAxisValues();
			const axisEls = renderItemEl.querySelectorAll(".axis");

			// get the locked/unlocked status of each axis
			axisEls.forEach((axisEl, a) => {
				const axis = GLOBAL.font.fvar.axes[a];
				const valueEl = axisEl.querySelector(".value");
				if (!axisEl.querySelector(".lock").classList.contains("locked")) {
					valueEl.value = axisValues[a];
				}
				//thisRenderVariationSettings.push(`"${axis.axisTag}" ${valueEl.value}`);
				fvsEntries.push(`"${axis.axisTag}" ${valueEl.value}`);
			//});
			});

			//renderEl.style.fontVariationSettings = thisRenderVariationSettings.join();
		}

		renderEl.style.fontVariationSettings = fvsEntries.join();
	});
}



initFencer();

