import os
from castle_data import castle_rooms # This now loads from parsed_rooms.json
import json # Though not strictly needed in this script if castle_data handles it

# Create html_map directory if it doesn't exist
if not os.path.exists("html_map"):
    os.makedirs("html_map")

# 1. Determine Global Grid Boundaries from all rooms
all_coords = []
if castle_rooms: # Check if castle_rooms is not empty
    for r_id, r_data in castle_rooms.items():
        coords = r_data.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) == 2:
            all_coords.append(coords)
        # else:
            # print(f"Warning: Room {r_id} has invalid or missing coordinates: {coords}")

if not all_coords:
    # Default grid if no rooms have coordinates or castle_rooms is empty
    min_x, max_x, min_y, max_y = 0, 0, 0, 0
else:
    min_x = min(c[0] for c in all_coords) - 1  # Padding
    max_x = max(c[0] for c in all_coords) + 1  # Padding
    min_y = min(c[1] for c in all_coords) - 1  # Padding
    max_y = max(c[1] for c in all_coords) + 1  # Padding
global_grid_bounds = (min_x, max_x, min_y, max_y)


# 2. Minimap Generation Function
def generate_minimap(current_room_id, all_rooms_data_for_minimap, grid_bounds_for_minimap):
    p_min_x, p_max_x, p_min_y, p_max_y = grid_bounds_for_minimap
    minimap_html = '<table border="1" style="border-collapse: collapse; margin: 10px;">\n'

    coord_to_room = {}
    if all_rooms_data_for_minimap:
        for r_id, data in all_rooms_data_for_minimap.items():
            coords = data.get("coordinates")
            if isinstance(coords, (list, tuple)) and len(coords) == 2 : # Ensure coords are valid tuple/list
                 # Ensure coordinates are tuples for dictionary keys
                coord_to_room[tuple(coords)] = r_id
            # else:
                # print(f"Warning (minimap): Room {r_id} has invalid coords for minimap: {coords}")


    for y in range(p_max_y, p_min_y - 1, -1): # Iterate from top to bottom
        minimap_html += "  <tr>\n"
        for x in range(p_min_x, p_max_x + 1):
            room_id_at_coord = coord_to_room.get((x, y))
            if room_id_at_coord:
                if room_id_at_coord == current_room_id:
                    minimap_html += f'    <td style="background-color: yellow; padding: 5px; text-align: center;">{room_id_at_coord}</td>\n'
                else:
                    minimap_html += f'    <td style="padding: 5px; text-align: center;"><a href="{room_id_at_coord}.html">{room_id_at_coord}</a></td>\n' # Link other rooms
            else:
                minimap_html += '    <td style="padding: 5px;">&nbsp;</td>\n'
        minimap_html += "  </tr>\n"
    minimap_html += "</table>\n"
    return minimap_html

# Temporary: Process only a small subset of rooms for testing
# Ensure castle_rooms is not None and has items before slicing
# if castle_rooms:
    # rooms_to_process = dict(list(castle_rooms.items())[:5]) # Commented out for full processing
# else:
    # rooms_to_process = {}
    # print("Warning: castle_rooms is empty or not loaded. No HTML will be generated.")

# Process a defined subset of rooms
# limit_to_n_rooms = 25
if castle_rooms:
    # rooms_to_process = dict(list(castle_rooms.items())[:limit_to_n_rooms])
    rooms_to_process = dict(list(castle_rooms.items()))
else:
    rooms_to_process = {} # Should already be handled by previous check, but good for safety

# Loop through selected rooms and generate HTML
if not rooms_to_process:
    print("No rooms to process. Exiting.")
else:
    print(f"Processing {len(rooms_to_process)} rooms for HTML generation...")

for room_id, room_data in rooms_to_process.items(): # Iterate over all rooms in castle_rooms
    # 3. Integration into HTML Generation: Call generate_minimap with full castle_rooms for all_rooms_data
    # and with global_grid_bounds
    minimap_content = generate_minimap(room_id, castle_rooms, global_grid_bounds)

    room_name = room_data.get('name', 'N/A')
    description_raw = room_data.get('description', 'No description available.')
    description_html = description_raw.replace('\n', '<br>') # Handle newlines for HTML
    connections = room_data.get('connections', {})

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>{room_name}</title>
    <link rel="stylesheet" type="text/css" href="style.css">
</head>
<body>
    <h1>{room_name}</h1>
    <img src="../images/map_room_default.png" alt="Map Room Image" class="room-image">
    <p>{description_html}</p>
    <h2>Connections</h2>
"""
    if connections:
        html_content += "    <ul>\n"
        for connected_room_id, connection_desc in connections.items():
            # Ensure connected_room_id is a string
            html_content += f'        <li><a href="{str(connected_room_id)}.html">{connection_desc}</a></li>\n'
        html_content += "    </ul>\n"
    else:
        html_content += "    <p>No known connections from this room.</p>\n"

    html_content += f"""    <div id="minimap_placeholder">
{minimap_content}    </div>
</body>
</html>
"""
    filepath = os.path.join("html_map", f"{room_id}.html")
    try:
        with open(filepath, "w", encoding='utf-8') as f:
            f.write(html_content)
        print(f"Generated {filepath}")
    except Exception as e:
        print(f"Error writing file {filepath}: {e}")

if rooms_to_process:
    print("Subset HTML generation complete.")
