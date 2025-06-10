import re
import json
import markdown2

def parse_markdown_to_json(markdown_file_path, json_file_path):
    with open(markdown_file_path, 'r', encoding='utf-8') as f:
        markdown_content = f.read()

    # Regex for room headings (H3 or H4)
    room_heading_regex = re.compile(r"^(###|####)\s+(([Kk]\d+[a-z]?)\.?)\s*(.*)")

    # Regex for major section headers (H2)
    major_section_header_regex = re.compile(r"^(##\s+.*)")

    section_coords_config = {
        "## Walls of Ravenloft": {"base_y": 0, "next_x": 0, "current_y_offset": 0, "section_id_prefix": "WALL"},
        "## Main Floor": {"base_y": 10, "next_x": 0, "current_y_offset": 0, "section_id_prefix": "MAIN"},
        "## Court of the Count": {"base_y": 20, "next_x": 0, "current_y_offset": 0, "section_id_prefix": "COURT"},
        "## Rooms of Weeping": {"base_y": 30, "next_x": 0, "current_y_offset": 0, "section_id_prefix": "WEEP"},
        "## Spires of Ravenloft": {"base_y": 40, "next_x": 0, "current_y_offset": 0, "section_id_prefix": "SPIRE"},
        "## Larders of Ill Omen": {"base_y": -10, "next_x": 0, "current_y_offset": 0, "section_id_prefix": "LARDER"}, # Negative for below ground
        "## Dungeon and Catacombs": {"base_y": -20, "next_x": 0, "current_y_offset": 0, "section_id_prefix": "DUNGEON"},
        "default": {"base_y": -100, "next_x": 0, "current_y_offset": 0, "section_id_prefix": "MISC"} # For rooms not under a known section
    }
    rooms_per_row_in_section = 5

    connection_patterns = [
        re.compile(r"((?:leads? to|door to|doors to|passage to|access to|opens into|reveals|connects to|connects with|adjoins|is described in|ending at|leading to|provides access to)\s+(?:area\s+|the\s+|a\s+)?([Kk]\d+[a-z]?\b))", re.IGNORECASE),
        re.compile(r"((?:staircase|stairs)\s+(?:leads?|climbs?|descends?|goes|start at|end at|curl)\s+(?:up to|down to|to|from|into|upward around|upward to|downward to)\s+(?:area\s+|the\s+|a\s+)?([Kk]\d+[a-z]?\b))", re.IGNORECASE),
        re.compile(r"((?:area\s+)?([Kk]\d+[a-z]?\b)\s+lies beyond)", re.IGNORECASE),
        re.compile(r"(beyond it lies\s+(?:another\s+[\w\s-]*?\s+chamber\s+\((?:area\s+)?)?([Kk]\d+[a-z]?\b))", re.IGNORECASE),
        re.compile(r"((?:The|A)\s+(?:[\w\s-]+?)\s(?:door|doors|archway|opening|passage|staircase|stairs|window)\s*(?:on|in|to|at)\s+(?:the\s+)?(?:[\w\s-]+?)\s+(?:wall|end|side)?\s*(?:leads? to|opens? into|reveals|climbs to|descends to|provide access to|connects to|connects with|adjoins)\s+(?:area\s+|the\s+|a\s+)?([Kk]\d+[a-z]?\b))", re.IGNORECASE),
        re.compile(r"((?:doors|door|archway)\s+that\s+adjoin(?:s)?\s+(?:area\s+)?([Kk]\d+[a-z]?\b))", re.IGNORECASE),
        re.compile(r"((?:secret door|trapdoor)[^.!?]*?conceals\s+a\s+ladder\s+leading\s+(?:down\s)?to\s+(?:area\s+)?([Kk]\d+[a-z]?\b))", re.IGNORECASE),
        re.compile(r"((?:ending|ends)\s+at\s+(?:[^.!?]*?\((?:area\s+)?)?([Kk]\d+[a-z]?\b)\)?)", re.IGNORECASE),
        re.compile(r"((?:staircase|stairs)\s*(?:\(area\sK\d+[a-z]?\b\))?\s*leads\s+(?:up|down)?\s*to\s+(?:area\s+)?([Kk]\d+[a-z]?\b))", re.IGNORECASE),
        re.compile(r"(archways\s+that\s+lead\s+to\s+areas\s+([Kk]\d+[a-z]?\b)\s+and\s+([Kk]\d+[a-z]?\b))", re.IGNORECASE),
        re.compile(r"((?:archways|doors|openings)\s+(?:that\s)?lead\s+to\s+areas\s+((?:[Kk]\d+[a-z]?\b(?:,\s*|\s+and\s+)?)+))", re.IGNORECASE),
        re.compile(r"((?:secret door|secret trapdoor)\s*(?:in|on|set into|behind)[^.!?]*?(?:opens? into|reveals|leads? to|can be pulled open to reveal)\s+(?:area\s+|the\s+|a\s+)?([Kk]\d+[a-z]?\b))", re.IGNORECASE),
        re.compile(r"(connecting with area\s+([Kk]\d+[a-z]?\b))", re.IGNORECASE),
        re.compile(r"((?:descends|ascends|climbs|spirals upward around)[^.!?]*? to area\s+([Kk]\d+[a-z]?\b))", re.IGNORECASE),
        re.compile(r"([\w\s]+?(?:leads? to|opens? into|reveals|connects to|accesses|goes to|continues to|ends at|stops at|stop just beneath|can be pushed open to reveal)\s+(?:area\s+|the\s+|a\s+)?([Kk]\d+[a-z]?\b))", re.IGNORECASE),
    ]

    special_sub_headings = [
        "#### Treasure", "#### Development", "#### Fortunes of Ravenloft", "#### Gate Towers",
        "#### The Heart", "#### Flight of the Vampire", "#### Secret Doors", "#### Tormented Spirit",
        "#### Pidlwick II", "#### Wine Casks", "#### Landing", "#### Teleport Traps",
        "#### Crypt \\d+",
        "\\*\\*\\*Treasure\\.\\*\\*\\*", "\\*\\*\\*Glider\\.\\*\\*\\*", "\\*\\*\\*Vault\\.\\*\\*\\*",
        "\\*\\*\\*Animated Halberds\\.\\*\\*\\*", "\\*\\*\\*Vampire Spawn\\.\\*\\*\\*",
        "\\*\\*\\*Northern Casks\\.\\*\\*\\*", "\\*\\*\\*Eastern Casks\\.\\*\\*\\*", "\\*\\*\\*Southern Casks\\.\\*\\*\\*",
    ]
    # Stop phrases for description block, including major section headers
    stop_phrases_regex_str = r"^(###|####)\s+[Kk]\d+[a-z]?\b|" + "|".join(special_sub_headings) + \
                              r"|^(##\s+.*)" # Add H2 headers as stop phrases for description
    stop_phrases_regex = re.compile(stop_phrases_regex_str)

    parsed_rooms = []
    lines = markdown_content.splitlines()

    current_major_section_key = "default" # Start with a default section
    current_room_data = None
    description_lines = []

    for line_number, line in enumerate(lines):
        major_section_match = major_section_header_regex.match(line)
        room_match = room_heading_regex.match(line)

        if major_section_match:
            # Finalize previous room if any, before switching major section
            if current_room_data:
                raw_description = "\n".join(description_lines).strip()
                current_room_data["description"] = markdown2.markdown(raw_description)
                parsed_rooms.append(current_room_data)
                current_room_data = None
                description_lines = []

            current_major_section_key = line.strip() # e.g., "## Walls of Ravenloft"
            if current_major_section_key not in section_coords_config:
                # If a new H2 appears that's not in config, assign to default or create dynamically
                print(f"Warning: Unconfigured H2 section '{current_major_section_key}'. Assigning to default coordinates.")
                current_major_section_key = "default"

        elif room_match:
            if current_room_data: # Save previous room
                raw_description = "\n".join(description_lines).strip()
                current_room_data["description"] = markdown2.markdown(raw_description)
                parsed_rooms.append(current_room_data)

            description_lines = []
            level, full_id_dot, room_id, room_name = room_match.groups()
            room_id = room_id.upper()
            room_name = room_name.strip().replace(":", "")

            # Assign coordinates based on current major section
            section_config = section_coords_config.get(current_major_section_key, section_coords_config["default"])

            coord_x = section_config["next_x"]
            coord_y = section_config["base_y"] + section_config["current_y_offset"]

            section_config["next_x"] += 1
            if section_config["next_x"] >= rooms_per_row_in_section:
                section_config["next_x"] = 0
                section_config["current_y_offset"] += 1 # Simple Y increment, could be smarter

            current_room_data = {
                "id": room_id,
                "name": room_name,
                "description": "",
                "connections": {},
                "coordinates": [coord_x, coord_y] # New coordinates
            }

        elif current_room_data: # Line is part of a room's content
            # Check for stop phrases that indicate end of main description
            # but are not new room headings or major section headings
            if stop_phrases_regex.match(line) and \
               not room_heading_regex.match(line) and \
               not major_section_header_regex.match(line):

                # Finalize current room's description if a special sub-heading is found
                current_room_data["description"] = "\n".join(description_lines).strip()
                # Note: We don't append and reset current_room_data here,
                # as these sub-headings are part of the room's broader content block.
                # The connection parsing below will still run on these lines.
                # The main description is considered "stopped" for adding more general paragraph text.
                # This logic might need refinement if sub-headings should fully terminate all parsing for a room.

            # Add to current room's description lines (even if it's a sub-heading line, for connection parsing)
            # Store raw markdown lines for later conversion
            if not stop_phrases_regex.match(line) or room_heading_regex.match(line) or major_section_header_regex.match(line):
                 description_lines.append(line) # Store original line for markdown conversion
            elif stop_phrases_regex.match(line): # if it's a stop phrase but not a room/major heading
                 description_lines.append(line) # still include it for now, markdown converter will handle it.

            # Connection Parsing (on the original line for context)
            sentences = re.split(r'((?:[^.!?]|[.!?](?!\s|$))+[.!?])', line)
            sentences = [s.strip() for s in sentences if s and s.strip()]

            for pattern in connection_patterns:
                for sentence_part in sentences:
                    connection_matches = pattern.finditer(sentence_part)
                    for conn_match in connection_matches:
                        try:
                            groups = conn_match.groups()
                            desc_text_raw = groups[0]

                            dest_ids_to_process = []
                            if pattern.pattern == r"(archways\s+that\s+lead\s+to\s+areas\s+([Kk]\d+[a-z]?\b)\s+and\s+([Kk]\d+[a-z]?\b))" and len(groups) >= 3:
                                dest_ids_to_process = [groups[1], groups[2]]
                            elif pattern.pattern == r"((?:archways|doors|openings)\s+(?:that\s)?lead\s+to\s+areas\s+((?:[Kk]\d+[a-z]?\b(?:,\s*|\s+and\s+)?)+))" and len(groups) >= 2:
                                room_id_list_str = groups[1]
                                dest_ids_to_process = re.findall(r"([Kk]\d+[a-z]?\b)", room_id_list_str)
                            else:
                                dest_ids_to_process = [groups[-1]]

                            for dest_room_id_raw_single in dest_ids_to_process:
                                if dest_room_id_raw_single:
                                    dest_room_id = dest_room_id_raw_single.upper().replace('.', '').strip()
                                    if not dest_room_id or not re.match(r"^[Kk]\d+[A-Z]?$", dest_room_id):
                                        continue

                                    connection_description = desc_text_raw.strip().replace(">>", "").replace("**", "").replace("*", "")
                                    connection_description = (connection_description[:150] + '...') if len(connection_description) > 153 else connection_description

                                    if dest_room_id != current_room_data["id"]:
                                        if dest_room_id not in current_room_data["connections"] or \
                                           len(connection_description) > len(current_room_data["connections"][dest_room_id]):
                                            current_room_data["connections"][dest_room_id] = connection_description
                        except IndexError: pass
                        except Exception: pass

    if current_room_data: # Add the last processed room
        raw_description = "\n".join(description_lines).strip()
        current_room_data["description"] = markdown2.markdown(raw_description)
        parsed_rooms.append(current_room_data)

    with open(json_file_path, 'w', encoding='utf-8') as f:
        json.dump(parsed_rooms, f, indent=4)

if __name__ == '__main__':
    parse_markdown_to_json('Castle Ravenloft.md', 'parsed_rooms.json')
    print(f"Parsed data written to parsed_rooms.json with new coordinate strategy.")
