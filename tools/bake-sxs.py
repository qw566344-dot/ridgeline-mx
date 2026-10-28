# =====================================================================
#  The user's side-by-side (buggy.glb from Sketchfab) -> client/models/dune_runner.glb
#  - wheels: the left/right tyres and rims come as one piece per axle, so they
#    are split by side and named wheel_FL / wheel_FR / wheel_RL / wheel_RR
#  - the steering wheel becomes 'steering_wheel', everything else 'body'
#  - scaled so the tyres are 0.37 m radius, turned so it faces +x (glTF), ground at 0
#  - the body is simplified to a game-friendly size
#  blender --background --factory-startup --python tools/bake-sxs.py -- in.glb out.glb
# =====================================================================
import bpy, bmesh, sys, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
# bake every transform into the meshes
for o in meshes:
    o.data = o.data.copy()
    o.data.transform(o.matrix_world)
    o.parent = None
    o.matrix_world = Matrix.Identity(4)

def bbox(o):
    vs = [v.co for v in o.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return mn, mx

# Blender axes after the glTF import: model forward (+glTF z) is -Y, up is +Z, glTF x is +X
# wheels: the big round pieces whose X span is the whole axle
wheel_parts, steer_parts, body = [], [], []
for o in meshes:
    mn, mx = bbox(o)
    size = mx - mn
    if size.x > 4.5 and abs(size.y - size.z) < 0.3 and size.z > 1.0:
        wheel_parts.append(o)
    elif o.name.startswith('Cylinder.052') or o.name.startswith('Cylinder.053'):
        steer_parts.append(o)
    else:
        body.append(o)
print('wheel pieces', [o.name for o in wheel_parts], 'steer', [o.name for o in steer_parts])

def join(objs, name):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name; ob.data.name = name
    return ob

# split each axle's tyre + rim into left and right
wheels = {}
for o in wheel_parts:
    bm = bmesh.new(); bm.from_mesh(o.data)
    cy = sum(v.co.y for v in bm.verts) / len(bm.verts)
    front = cy < 0  # forward is -Y
    for side, keep in (('L', lambda x: x > 0), ('R', lambda x: x <= 0)):
        b2 = bm.copy()
        bmesh.ops.delete(b2, geom=[f for f in b2.faces if not keep(f.calc_center_median().x)], context='FACES')
        me = bpy.data.meshes.new('w'); b2.to_mesh(me); b2.free()
        for m in o.data.materials: me.materials.append(m)
        ob = bpy.data.objects.new('w', me); bpy.context.scene.collection.objects.link(ob)
        wheels.setdefault(('F' if front else 'R') + side, []).append(ob)
    bm.free()
    bpy.data.objects.remove(o)
# glTF +x is the vehicle's LEFT when it faces +z, so x > 0 = left
wheel_objs = {k: join(v, 'wheel_' + k) for k, v in wheels.items()}
steer = join(steer_parts, 'steering_wheel') if steer_parts else None
body_ob = join(body, 'body')

# scale + orientation: tyres 0.37 m radius; face +X in Blender (= glTF +x forward)
r0 = (bbox(wheel_objs['FL'])[1].z - bbox(wheel_objs['FL'])[0].z) / 2
S = 0.37 / r0
rot = Matrix.Rotation(math.radians(90), 4, 'Z')    # -Y forward -> +X forward
allobs = list(wheel_objs.values()) + [body_ob] + ([steer] if steer else [])
for o in allobs:
    o.data.transform(Matrix.Scale(S, 4) @ rot)
lowest = min(bbox(o)[0].z for o in wheel_objs.values())
for o in allobs:
    o.data.transform(Matrix.Translation((0, 0, -lowest)))
# centre the wheelbase on x = 0
fx = (bbox(wheel_objs['FL'])[0].x + bbox(wheel_objs['FL'])[1].x) / 2
rx = (bbox(wheel_objs['RL'])[0].x + bbox(wheel_objs['RL'])[1].x) / 2
for o in allobs:
    o.data.transform(Matrix.Translation((-(fx + rx) / 2, 0, 0)))

# simplify the body (it is CAD-like, so flat areas first, then a gentle collapse)
def simplify(ob, target):
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.object.mode_set(mode='OBJECT')
    m = ob.modifiers.new('p', 'DECIMATE'); m.decimate_type = 'DISSOLVE'; m.angle_limit = math.radians(3); bpy.ops.object.modifier_apply(modifier='p')
    t = ob.modifiers.new('t', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier='t')
    n = len(ob.data.polygons)
    if n > target:
        d = ob.modifiers.new('d', 'DECIMATE'); d.ratio = target / n; bpy.ops.object.modifier_apply(modifier='d')
    print(ob.name, n, '->', len(ob.data.polygons))
simplify(body_ob, 26000)
for o in wheel_objs.values(): simplify(o, 2200)

# report what the game config needs (glTF axes: x forward, y up, z = -Blender y = right)
def c(o):
    mn, mx = bbox(o); m = (mn + mx) / 2
    return (round(m.x, 3), round(m.z, 3), round(-m.y, 3)), (round((mx.z - mn.z) / 2, 3), round(mx.y - mn.y, 3))
for k, o in wheel_objs.items(): print('WHEEL', k, c(o))
if steer: print('STEER', c(steer))
mn, mx = bbox(body_ob); print('BODY x', round(mn.x, 2), round(mx.x, 2), 'up', round(mn.z, 2), round(mx.z, 2), 'side', round(-mx.y, 2), round(-mn.y, 2))
for o in allobs:
    for p in o.data.polygons: p.use_smooth = True
for o in bpy.context.selected_objects: o.select_set(False)
for o in allobs: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_normals=True, export_animations=False, export_apply=True)
print('wrote', OUT)
