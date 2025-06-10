import os
from castle_data import castle_rooms

# Create html_map directory if it doesn't exist
if not os.path.exists("html_map"):
    os.makedirs("html_map")

# 1. Determine Grid Boundaries
all_coords = [data["coordinates"] for data in castle_rooms.values()]
if not all_coords:
    min_x, max_x, min_y, max_y = 0, 0, 0, 0
else:
    min_x = min(c[0] for c in all_coords) - 1  # Padding
    max_x = max(c[0] for c in all_coords) + 1  # Padding
    min_y = min(c[1] for c in all_coords) - 1  # Padding
    max_y = max(c[1] for c in all_coords) + 1  # Padding

# 2. Minimap Generation Function
def generate_minimap(current_room_id, all_rooms_data, p_min_x, p_max_x, p_min_y, p_max_y):
    minimap_html = '<table border="1" style="border-collapse: collapse; margin: 10px;">\n'

    # Create a reverse mapping from coordinates to room_id for quick lookup
    coord_to_room = {data["coordinates"]: r_id for r_id, data in all_rooms_data.items()}

    for y in range(p_max_y, p_min_y - 1, -1): # Iterate from top to bottom for visual map layout
        minimap_html += "  <tr>\n"
        for x in range(p_min_x, p_max_x + 1):
            room_id_at_coord = coord_to_room.get((x, y))
            if room_id_at_coord:
                if room_id_at_coord == current_room_id:
                    minimap_html += f'    <td style="background-color: yellow; padding: 5px; text-align: center;">{room_id_at_coord}</td>\n'
                else:
                    minimap_html += f'    <td style="padding: 5px; text-align: center;">{room_id_at_coord}</td>\n'
            else:
                minimap_html += '    <td style="padding: 5px;">&nbsp;</td>\n'
        minimap_html += "  </tr>\n"
    minimap_html += "</table>\n"
    return minimap_html

# Loop through each room and generate HTML
for room_id, room_data in castle_rooms.items():
    # 3. Integration into HTML Generation
    minimap_content = generate_minimap(room_id, castle_rooms, min_x, max_x, min_y, max_y)

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>{room_data['name']}</title>
    <link rel="stylesheet" type="text/css" href="style.css">
</head>
<body>
    <h1>{room_data['name']}</h1>
    <p>{room_data['description']}</p>
    <h2>Connections</h2>
    <ul>
"""
    for connected_room_id, connection_desc in room_data["connections"].items():
        html_content += f'        <li><a href="{connected_room_id}.html">{connection_desc}</a></li>\n'

    html_content += f"""    </ul>
    <div id="minimap_placeholder">
{minimap_content}    </div>
</body>
</html>
"""
    filepath = os.path.join("html_map", f"{room_id}.html")
    with open(filepath, "w") as f:
        f.write(html_content)

    print(f"Generated {filepath}")

print("HTML generation complete with minimaps.")
