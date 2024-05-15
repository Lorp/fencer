# Fencer
Fencer is a GUI app that allows users to create avar (v2) tables inside their variable fonts. These tables allow for more complex and expressive mappings between designspace locations and variable font instances. Use cases include:
* arbitrary distortion of the designspace, avoiding the need for additional masters and thus reducing font size;
* compact and practical parametric fonts;
* higher order interpolation (HOI) without duplicating axis names.

[**Launch Fencer**](https://lorp.github.io/fencer/src/fencer.html)

## UI Basics

The UI is structured as follows:
* **Upper section**, where the user adds & edits Mappings:
  * **Controls panel**, with:
    * a bank of sliders
	* a dropdown selector to choose whether one is editing the Current location or one of the Mappings
	* reset-to-default buttons (click resets input locations, shift-click resets output locations)
	* radio buttons to select X and Y axes in the Visial window.
  * **Visual panel**, where:
    * the Mappings are displayed as arrows in 2D space
	* the dimensions of that 2D space are controlled by the radio buttons in the Controls panel
	* the Current location is displayed as a blue dot
	* you can drag the Current location around
	* you can add and delete Mappings, and drag them around
  * **XML panel**, where designspace-compatible XML is generated. This may be pasted into the \<axes\> element of a designspace file, that can be built using fontmake.
* **Lower section**, where the current instance is rendered, and the user can add more instances. All instances are updated whenever mappings are changed.

## First steps

Try Fencer on the font that is preloaded, a custom build of [Sofia Sans](https://github.com/lettersoup/Sofia-Sans), a 2-axis font (Weight and Width) with this simple master structure and default at 400,100:

|          | wght=100 | wght=400 | wght=900 |
| ------    | ------   | ------   | -----    |
| wdth=100  | 100,100 | **400,100**  | 900,100 |
| wdth=62.5 | 100,62.5 | 400,62.5 | 900,62.5 |

_Note: The current shipping version of Sofia Sans uses a more complex master structure, since – without avar2 – the design space requires additional “synthetic” masters to represent the designer’s intentions. The avar2 mappings allow us to avoid the additional masters, and thus reduce font size and simplify maintenance._

Now let’s say you find the Black ExtraCondensed (900,62.5) instance to be too heavy. We can add avar2 mappings to help.

First, let’s add a few instances to help us visualize what is happening, as follows:

* Set the location to 400,62.5.
* Click the “Add Instance” button.
* Set the location to 500,62.5.
* Click the “Add Instance” button.
* Set the location to 600,62.5.
* Click the “Add Instance” button.
* Set the location to 700,62.5.
* Click the “Add Instance” button.
* Set the location to 800,62.5.
* Click the “Add Instance” button.
* Set the location to 900,62.5.
* Click the “Add Instance” button.

Next, let’s add a single avar2 mapping:

* Click the **+** button in the Mappings Visual section.
* Drag the Red input handle to the location 900,62.5.
* Ensure the Red input handle is exactly on 900,62.5 (use the slider controls or text input boxes if dragging is too imprecise).
* Set the Green output handle to around 650,70, by dragging or by the controls (exact location is not important).

As you drag the Green output handle, a new avar table is compiled, inserted into the font, and all the instance windows updated to use the new font. This happens multiple times per second, enabling you to test different mappings quickly.

It is important to note that, despite the renderings changing in appearance, the axis locations remain constant as you adjust the mappings.

## Trying your own fonts in Fencer

Drop your TTF onto the blue area around the “Controls” text.

For best results, use a font without an avar table, since Fencer will overwrite any existing avar table.

## Testing fonts made by Fencer

Click “Download font” to get a copy of the latest font build.

When you are happy with the results, then instead of using the font made by Fencer directly, it is recommended to copy the XML from the XML panel into the \<axes\> element of a designspace file, and compile using fontmake.

## References

* [avar v2 specification](https://github.com/harfbuzz/boring-expansion-spec/blob/main/avar2.md)
* [avar v2 intro video](https://www.youtube.com/watch?v=j7unMVZOcaw) and [slides](https://docs.google.com/presentation/d/1i8CEqHkVR4oAZKjU_BqtzzrOx2lAfDDjwkAgzlEGjuo/) (October 2022) by Laurence Penney & Dave Crossland
* [designspaceLib: Document XML structure: \<mappings\> element](https://fonttools.readthedocs.io/en/latest/designspaceLib/xml.html#mappings-element)