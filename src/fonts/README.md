## Fencer: Test fonts for avar2

### avar2 checker

The font checks whether avar2 is active in the renderer being used. 

The font has 2 axes, but only one is intended for external use:

* **AVAR** min=0, default=0, max=100 [_AVAR_]: is offered for user control, and controls the AVWK axis via avar2
* **AVWK** min=0, default=0, max=100 [_AVAR worker_]: is controlled by the AVAR axis, and is a hidden axis

The font contains 2 glyphs:

* "**A**" demonstrates to **human users** whether avar2 is active in the renderer being used. The glyph design includes an arrow that responds to the user moving the AVAR axis to maximum (100). If avar2 is active, then the arrow points to a checkmark; otherwise it points to a cross.
* "**B**" provides **programmatic answers** to whether avar2 is active in the renderer being used. If avar2 is active, the glyph becomes much wider; otherwise it remains the same width. In an HTML+CSS+JS environment, code can query the width of a \<div\> that is typset in the test font, with AVAR=0 and AVAR=100. If the latter is larger than the former, then avar2 is active.

#### To do
It will be useful to verify that shaping is also using the axis values transformed by avar2. A third glyph should respond to kerning or feature variation, controlled directly by the AVWK axis and indirectly by the AVAR axis.

#### Production notes
The font was created in Glyphs as a simple 2-axis font. The avar2 functionality was added using Fencer. A single mapping was added, from [AVAR 100, AVWK 0] to [AVAR 100, AVWK 100].

The file to use: `avar2checkerVF-working.ttf`

