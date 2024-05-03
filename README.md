# Fencer
Fencer is a GUI app that allows users to create avar (v2) tables inside their variable fonts.

Drag your variable font onto the app to get started.

Live version on GitHub pages is [here](https://lorp.github.io/fencer/src/fencer.html)

## UI Basics

The UI is structured as follows:
* **Upper section**, where the user adds & edits Mappings:
  * **Controls panel**, with:
    * a bank of sliders;
	* a dropdown selector to choose whether one is editing the Current location or one of the Mappings;
	* reset-to-default buttons (click resets input locations, shift-click resets output locations);
	* radio buttons to select X and Y axes in the Visial window.
  * **Visual panel**, where the Mappings are displayed as arrows in a 2D space, the dimensions of that 2D space being controlled by the radio buttons in the Controls panel.
  * **XML panel**, where designspace-compatible XML is generated. This may be pasted into the \<axes\> element of a designspace file — in fact this method is recommended when the user intends to build final files rather than test files.
* **Lower section**, where the current instance is rendered, and the user can add more instances. All instances are updated whenever mappings are changed.

## First steps

Try Fencer on the font that is preloaded, a custom build of Sofia Sans, a 2-axis font (Weight and Width) with this simple master structure and default at 400,100:

|          | wght=100 | wght=400 | wght=900 |
| ------    | ------   | ------   | -----    |
| wdth=100  | 100,100 | **400,100**  | 900,100 |
| wdth=62.5 | 100,62.5 | 400,62.5 | 900,62.5 |

Now let’s say you find the Black ExtraCondensed (900,62.5) instance to be too heavy. We can add avar2 mappings to help.

First, let’s add some instances to help us visualize what is happening, as follows:

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

## Testing fonts outside of Fencer

Use the button “Temp download link” to download a copy of the most recent build of the font.