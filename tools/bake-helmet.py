# =====================================================================
#  Rider helmet: camouflage bike helmet.glb -> client/models/rider_helmet.glb
#  Paints out the logo decals, marks the camo shell magenta (the game swaps
#  that for each rider's jersey colour), merges the parts into one mesh.
#  blender --background --factory-startup --python tools/bake-helmet.py -- in.glb out.glb preview.png
# =====================================================================
# Camo helmet: paint out the logo decals, merge into one textured mesh, export GLB.
import bpy, sys, numpy as np, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
src, out_glb, out_png = argv[0], argv[1], argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
img = bpy.data.images['mateo bike helmet texture']
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[::-1].copy()  # row 0 = top

# decal boxes in top-left pixel coords: x0, y0, x1, y1
boxes = [(195, 85, 425, 165), (425, 520, 480, 605), (900, 520, 960, 615), (398, 278, 572, 472), (806, 278, 988, 472)]
mask = np.zeros((H, W), bool)
rgb = px[:, :, :3]
light = rgb.min(axis=2) > 0.8
for x0, y0, x1, y1 in boxes:
    mask[y0:y1, x0:x1] |= light[y0:y1, x0:x1]
# grow the mask so anti-aliased edges go too
for _ in range(3):
    m = mask.copy()
    m[1:] |= mask[:-1]; m[:-1] |= mask[1:]; m[:, 1:] |= mask[:, :-1]; m[:, :-1] |= mask[:, 1:]
    inside = np.zeros_like(mask)
    for x0, y0, x1, y1 in boxes: inside[y0:y1, x0:x1] = True
    mask = m & inside
print('decal pixels', int(mask.sum()))
# onion-peel fill: each pass, masked pixels next to known pixels take their average
known = ~mask
for it in range(200):
    if known.all(): break
    acc = np.zeros_like(rgb); cnt = np.zeros((H, W), np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        k = np.roll(np.roll(known, dy, 0), dx, 1)
        c = np.roll(np.roll(rgb, dy, 0), dx, 1)
        acc += c * k[:, :, None]; cnt += k
    edge = (~known) & (cnt > 0)
    rgb[edge] = acc[edge] / cnt[edge][:, None]
    known = known | edge
px[:, :, :3] = rgb
# camo -> key colour: the game paints the shell in the rider's colour
mx_ = rgb.max(axis=2); mn_ = rgb.min(axis=2)
sat = (mx_ - mn_) / np.maximum(mx_, 1e-3)
camo = (sat > 0.14) | (mx_ < 0.3)
camo[0:70, 700:780] = False          # the black goggle lens block stays black
camo &= mx_ < 0.93                   # unused white background stays opaque
# tidy the edges: grow then shrink once
g = camo.copy(); g[1:] |= camo[:-1]; g[:-1] |= camo[1:]; g[:, 1:] |= camo[:, :-1]; g[:, :-1] |= camo[:, 1:]
camo = g
# key colour (pure magenta) marks the shell; the game swaps it for the rider's colour
px[camo, 0] = 1.0; px[camo, 1] = 0.0; px[camo, 2] = 1.0
px[:, :, 3] = 1.0
print('camo pixels', int(camo.sum()))
img.pixels[:] = px[::-1].ravel()
img.filepath_raw = out_png
img.file_format = 'PNG'
img.save()

# untextured parts: point their UVs at a plain white texel and carry their colour as vertex colour
white_uv = (0.8, 0.2)
obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in obs:
    me = o.data
    m = me.materials[0] if me.materials else None
    textured = m and m.use_nodes and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes)
    col = (1, 1, 1, 1)
    if not textured and m:
        b = [n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED']
        col = tuple(b[0].inputs['Base Color'].default_value) if b else (0.8, 0.8, 0.8, 1)
        for l in me.uv_layers[0].data: l.uv = white_uv
    ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for d in ca.data: d.color = col
for o in obs:
    o.data.materials.clear()
    o.data.materials.append(bpy.data.materials['material'])
bpy.ops.object.select_all(action='DESELECT')
for o in obs: o.select_set(True)
bpy.context.view_layer.objects.active = obs[0]
bpy.ops.object.join()
o = bpy.context.view_layer.objects.active
o.name = 'helmet'
# smaller texture for the game
img.scale(512, 512)
print('faces', len(o.data.polygons))
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_image_format='AUTO', export_vertex_color='ACTIVE', export_all_vertex_colors=True, export_normals=True, export_tangents=False, export_animations=False)
