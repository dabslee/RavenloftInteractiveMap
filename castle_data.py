castle_rooms = {
    "K1": {
        "name": "K1. Front Courtyard",
        "description": "You are in a wide courtyard, overlooked by the towering walls of Castle Ravenloft. The main entrance to the castle is to the north.",
        "connections": {
            "K7": "North Gate to Entry (K7)"
        },
        "coordinates": (0, 0)
    },
    "K7": {
        "name": "K7. Entry",
        "description": "A grand, but dusty, entryway. Doors lead east and west. A large staircase goes up. The main courtyard is to the south.",
        "connections": {
            "K1": "South Door to Courtyard (K1)",
            "K8": "East Door to Guests' Hall (K8)",
            "K21": "West Door to Servants' Entrance (K21a)", # Assuming K21a is part of K21
            "K19": "Stairs up to Great Landing (K19)"
        },
        "coordinates": (0, 1)
    },
    "K8": {
        "name": "K8. Guests' Hall",
        "description": "A once-opulent hall for guests, now covered in cobwebs. A door leads back to the Entry.",
        "connections": {
            "K7": "West Door to Entry (K7)"
        },
        "coordinates": (1, 1)
    },
    "K21": { # Simplified K21a as K21 for this example
        "name": "K21. Servants' Entrance",
        "description": "A plain entrance used by servants. A door leads back to the Entry.",
        "connections": {
            "K7": "East Door to Entry (K7)"
        },
        "coordinates": (-1, 1)
    },
    "K19": {
        "name": "K19. Great Landing",
        "description": "A large landing at the top of a grand staircase. Doors lead to various parts of the castle. Stairs lead down to the Entry.",
        "connections": {
            "K7": "Stairs down to Entry (K7)"
            # Add other connections as needed for a more complete example later
        },
        "coordinates": (0, 2)
    }
}

# Example of how to access data (for testing, not part of the file itself)
# print(castle_rooms["K1"]["name"])
# print(castle_rooms["K7"]["connections"])
