import json

# Define initial coordinates for a few key rooms
# These will be applied if the room exists in the parsed data.
initial_coordinates = {
    "K1": (0, 0),
    "K7": (0, 1),
    "K8": (1, 1),
    "K21": (-1, 1),  # Assuming K21 from markdown corresponds to original K21
    "K19": (0, 2)
}

raw_room_list = []
castle_rooms = {} # Define at top level for import even if loading fails

try:
    with open("parsed_rooms.json", "r", encoding='utf-8') as f:
        raw_room_list = json.load(f)
except FileNotFoundError:
    print("Error: parsed_rooms.json not found. Please run parse_markdown.py first.")
    # castle_rooms will remain empty, or you could raise an error:
    # raise FileNotFoundError("parsed_rooms.json not found. Run parse_markdown.py first.")
except json.JSONDecodeError:
    print("Error: Could not decode parsed_rooms.json. Check the file for syntax errors.")
    # castle_rooms will remain empty, or raise:
    # raise ValueError("Error decoding parsed_rooms.json")

if raw_room_list: # Only proceed if data was loaded
    for room_data_item in raw_room_list:
        room_id = room_data_item.get("id")
        if room_id:
            # Ensure coordinates are present and are a list/tuple of 2 elements
            # The parsed_rooms.json currently defaults to [0,0] which is a list.
            current_coords = room_data_item.get("coordinates")
            if not isinstance(current_coords, (list, tuple)) or len(current_coords) != 2:
                room_data_item["coordinates"] = [0, 0]  # Default if malformed or missing

            # Apply known initial coordinates if this room_id is in our initial set
            if room_id in initial_coordinates:
                room_data_item["coordinates"] = tuple(initial_coordinates[room_id]) # Ensure tuple
            else:
                # Ensure any other coordinates are also tuples
                room_data_item["coordinates"] = tuple(room_data_item["coordinates"])

            castle_rooms[room_id] = room_data_item
        else:
            print(f"Warning: Found a room entry without an ID in parsed_rooms.json: {room_data_item}")

if not castle_rooms and not raw_room_list: # If raw_room_list was loaded but resulted in empty castle_rooms
    pass # Errors already printed
elif not castle_rooms:
     print("Warning: castle_rooms data is empty after processing. HTML generation might produce no output or errors.")


# Optional: For direct testing of this script
if __name__ == "__main__":
    if castle_rooms:
        print(f"Successfully loaded {len(castle_rooms)} rooms.")
        if "K1" in castle_rooms:
            print(f"K1 Data: {castle_rooms['K1']}")
            print(f"K1 Coordinates: {castle_rooms['K1']['coordinates']}")
        if "K7" in castle_rooms:
            print(f"K7 Data: {castle_rooms['K7']}")
            print(f"K7 Coordinates: {castle_rooms['K7']['coordinates']}")
        if "K21" in castle_rooms: # K21 was one of the original with specific coords
            print(f"K21 Data: {castle_rooms['K21']}")
            print(f"K21 Coordinates: {castle_rooms['K21']['coordinates']}")
        # Check a room NOT in initial_coordinates to see its default
        # Find a room that's not K1, K7, K8, K21, K19
        example_other_room_id = None
        for r_id in castle_rooms:
            if r_id not in initial_coordinates:
                example_other_room_id = r_id
                break
        if example_other_room_id and example_other_room_id in castle_rooms:
             print(f"{example_other_room_id} Data: {castle_rooms[example_other_room_id]}")
             print(f"{example_other_room_id} Coordinates: {castle_rooms[example_other_room_id]['coordinates']}")

    else:
        print("No rooms loaded. Check for errors above or ensure parsed_rooms.json exists and is valid.")
