# =====================================================================
#  Turns the Tinkercad 2-stroke dirt bike (one fused mesh) into the game's
#  rigged bike model: client/models/kx_dirt_bike.glb
#
#  The source has no separate parts, so every face is sorted by WHERE it is
#  (source units, x forward, z up, y = left):
#    wheel_front / wheel_rear  inside the wheel's circle and between the fork legs
#    fork_lowers               on the fork line, below the fork guards
#    front_end                 on/ahead of the fork line, bars + clamps up top
#    swingarm                  the band from the pivot back to the rear axle
#    body                      everything else
#  Then each part is simplified, scaled to metres and exported with names
#  that MODELS.bike in shared/vehicles.js refers to.
#
#  Run (Blender 5):  blender --background --factory-startup --python tools/bake-kx-bike.py -- tinker.obj out.glb
# =====================================================================
import bpy, bmesh, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]

FRONT_AXLE = (54.0, 25.1)          # (x, z)
REAR_AXLE = (-54.5, 24.5)
WHEEL_R = 25.6
FORK_TOP = (19.0, 80.0)            # fork line runs from the front axle up to here
SWING_PIVOT = (-14.5, 35.5)
Y0 = 4.1                           # bike centre line (source y)
SCALE = 1.49 / 108.5               # wheelbase -> 1.49 m
X_SHIFT = 1.7                      # puts the axles at +0.765 / -0.725 m like the physics
PLANAR_DEG = 4.0
TARGET = {'body': 22000, 'front_end': 6000, 'fork_lowers': 1500, 'wheel_front': 7000, 'wheel_rear': 3500, 'tyre_rear': 5000, 'swingarm': 2000}

# fork line: unit direction (up the fork) and its forward normal
fx, fz = FORK_TOP[0] - FRONT_AXLE[0], FORK_TOP[1] - FRONT_AXLE[1]
fl = math.hypot(fx, fz); fx, fz = fx / fl, fz / fl
nx, nz = fz, -fx            # points forward / up
if nx < 0: nx, nz = -nx, -nz
sx, sz = REAR_AXLE[0] - SWING_PIVOT[0], REAR_AXLE[1] - SWING_PIVOT[1]
sl = math.hypot(sx, sz); sx, sz = sx / sl, sz / sl

def whole_part(mn, mx):
    # pieces Tinkercad kept separate: the tyres and the two fork lowers
    # the rear tyre mesh does not survive simplifying, so it is rebuilt from the front one
    if mx[0] < -28 and mn[0] < -75: return 'drop'
    if mn[0] > 28 and mx[0] > 76 and mn[2] < 2: return 'front_tyre'
    if 38 < mn[0] and mx[0] < 57 and mn[2] > 20 and mx[2] < 47.5 and (mx[1] - mn[1]) > 4: return 'fork_lowers'
    if mn[1] > 8.3 and mx[1] < 9.4: return 'body'   # chain links
    return None

def classify(c, mat):
    x, y, z = c
    lat = abs(y - Y0)
    rf = math.hypot(x - FRONT_AXLE[0], z - FRONT_AXLE[1])
    rr = math.hypot(x - REAR_AXLE[0], z - REAR_AXLE[1])
    dist = (x - FRONT_AXLE[0]) * nx + (z - FRONT_AXLE[1]) * nz   # >0: ahead of the fork line
    if rf < WHEEL_R and lat < 3.2: return 'wheel_front'
    if rr < WHEEL_R and lat < 4.8: return 'wheel_rear'
    green = mat.startswith('color_4634441')
    if dist > -3.4 and z < 47 and z > 12: return 'fork_lowers'
    if z > 76 and x > 12: return 'front_end'                       # bars, levers, top clamp
    if green:
        if x > 31 and z > 50: return 'front_end'                     # front fender (shrouds stay put)
    elif dist > -3.4 and 30 < z < 90 and lat < 10: return 'front_end' # fork tubes, plate, clamps
    # swingarm band from the pivot to the axle
    ax, az = x - SWING_PIVOT[0], z - SWING_PIVOT[1]
    along = ax * sx + az * sz
    off = abs(ax * sz - az * sx)
    if -1 < along < sl + 6 and off < 3.6 and z < 41: return 'swingarm'
    return 'body'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC, forward_axis='Y', up_axis='Z')
src = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
me = src.data
mats = [m.name for m in me.materials]
# loose pieces first (a piece is all-or-nothing when we recognise it)
bm0 = bmesh.new(); bm0.from_mesh(me); bm0.faces.ensure_lookup_table()
piece = {}
seen = set()
for f0 in bm0.faces:
    if f0.index in seen: continue
    stack, comp = [f0], []
    seen.add(f0.index)
    while stack:
        f = stack.pop(); comp.append(f)
        for e in f.edges:
            for g in e.link_faces:
                if g.index not in seen: seen.add(g.index); stack.append(g)
    vs = [v.co for f in comp for v in f.verts]
    mn = [min(v[i] for v in vs) for i in range(3)]; mx = [max(v[i] for v in vs) for i in range(3)]
    cls = whole_part(mn, mx)
    if cls:
        for f in comp: piece[f.index] = cls
bm0.free()
groups = {k: [] for k in TARGET}
for p in me.polygons:
    c = piece.get(p.index) or classify(p.center, mats[p.material_index])
    if c == 'drop': continue
    if c == 'front_tyre': groups['tyre_rear'].append(p.index); c = 'wheel_front'
    groups[c].append(p.index)
print({k: len(v) for k, v in groups.items()})

def tidy_materials(ob):
    for slot in ob.material_slots:
        m = slot.material
        if not m: continue
        n = m.name.split('.')[0]
        b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
        role = {'color_4634441': 'plastic_paint', 'color_2829873': 'seat', 'color_2828838': 'rubber', 'color_0': 'rubber',
                'color_10988977': 'metal', 'color_12561038': 'frame', 'color_14077624': 'fork_tube', 'color_15277357': 'spokes',
                'color_16448250': 'plate_white', 'color_6383466': 'dark_metal'}.get(n, n)
        m.name = role
        if b:
            if role == 'rubber': b.inputs['Base Color'].default_value = (0.05, 0.05, 0.055, 1)
            b.inputs['Roughness'].default_value = {'rubber': 0.95, 'metal': 0.35, 'fork_tube': 0.25, 'dark_metal': 0.5, 'seat': 0.8}.get(role, 0.55)
            b.inputs['Metallic'].default_value = {'metal': 0.7, 'fork_tube': 0.8, 'dark_metal': 0.6, 'frame': 0.3}.get(role, 0.0)

made = []
for name, faces in groups.items():
    if not faces: continue
    bm = bmesh.new(); bm.from_mesh(me)
    keep = set(faces)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
    nm = bpy.data.meshes.new(name); bm.to_mesh(nm); bm.free()
    for m in me.materials: nm.materials.append(m)
    ob = bpy.data.objects.new(name, nm); bpy.context.scene.collection.objects.link(ob)
    # metres, x forward, z up, y = left (Blender) -> glTF x forward, y up, z right
    if name == 'tyre_rear':  # front tyre -> rear axle, a little wider
        for v in nm.vertices:
            v.co = Vector((v.co.x - (FRONT_AXLE[0] - REAR_AXLE[0]), Y0 + (v.co.y - Y0) * 1.3, v.co.z - (FRONT_AXLE[1] - REAR_AXLE[1])))
    for v in nm.vertices:
        v.co = Vector(((v.co.x + X_SHIFT) * SCALE, (v.co.y - Y0) * SCALE, v.co.z * SCALE))
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0004)
    bpy.ops.object.mode_set(mode='OBJECT')
    n0 = len(nm.polygons)
    # CAD meshes: merging flat areas is safe; collapsing edges tears them apart
    mod = ob.modifiers.new('p', 'DECIMATE'); mod.decimate_type = 'DISSOLVE'; mod.angle_limit = math.radians(PLANAR_DEG)
    bpy.ops.object.modifier_apply(modifier='p')
    tri = ob.modifiers.new('t', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier='t')
    # then a gentle edge-collapse down to the budget for this part
    left = len(nm.polygons)
    if left > TARGET[name]:
        mod = ob.modifiers.new('d', 'DECIMATE'); mod.ratio = TARGET[name] / left; mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='d')
    # drop unused material slots
    used = {p.material_index for p in nm.polygons}
    for i in reversed(range(len(nm.materials))):
        if i not in used:
            ob.active_material_index = i
            bpy.ops.object.material_slot_remove()
    for p in nm.polygons: p.use_smooth = False
    tidy_materials(ob)
    print(name, n0, '->', len(nm.polygons))
    made.append(ob)

bpy.data.objects.remove(src)
# the rebuilt rear tyre joins the rear wheel
tyre = bpy.data.objects.get('tyre_rear'); wr = bpy.data.objects.get('wheel_rear')
if tyre and wr:
    keep_names = [o.name for o in made if o.name != 'tyre_rear']
    for o in bpy.context.selected_objects: o.select_set(False)
    tyre.select_set(True); wr.select_set(True); bpy.context.view_layer.objects.active = wr
    bpy.ops.object.join()
    made = [bpy.data.objects[n] for n in keep_names]
# shading: smooth by angle so round parts look round and edges stay crisp
for ob in made:
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
    except Exception: bpy.ops.object.shade_smooth()
for o in made: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_normals=True, export_animations=False, export_materials='EXPORT', export_apply=True)
print('wrote', OUT)
