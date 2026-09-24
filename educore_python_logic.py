import sys
import re
import requests

program = sys.stdin.read()

registers = [0] * 8
memory = {}

for line in program.splitlines():

    line = line.strip()

    if not line:
        continue

    arr = re.split(r"[ ,]+", line)

    instruction = arr[0]

    if instruction == "MOV":
        r = int(arr[1][1])

        if arr[2][0] == "#":
            registers[r] = int(arr[2][1:])
        else:
            registers[r] = registers[int(arr[2][1])]

    elif instruction == "ADD":
        rd = int(arr[1][1])
        r1 = int(arr[2][1])
        r2 = int(arr[3][1])

        registers[rd] = registers[r1] + registers[r2]

    elif instruction == "SUB":
        rd = int(arr[1][1])
        r1 = int(arr[2][1])
        r2 = int(arr[3][1])

        registers[rd] = registers[r1] - registers[r2]

    elif instruction == "STR":
        r = int(arr[1][1])
        address = int(arr[2][1:-1])

        memory[address] = registers[r]

    elif instruction == "LDR":
        r = int(arr[1][1])
        address = int(arr[2][1:-1])

        registers[r] = memory[address]

    elif instruction == "END":
        break


# Store registers in memory
for i in range(8):
    memory["R" + str(i)] = registers[i]


# Print registers
print("Registers:")

for i in range(8):
    print("R" + str(i), "=", registers[i])

print("Memory:", memory)


# --------------------------------
# SEND TO FIREBASE 1
# --------------------------------

firebase_url = "https://python-testing-d0bb6-default-rtdb.firebaseio.com/memory.json"

response = requests.put(
    firebase_url,
    json=memory
)

print("Firebase response:", response.json())


# --------------------------------
# GET FROM FIREBASE 2
# --------------------------------

firebase_url1 = "https://educore2-23d3e-default-rtdb.firebaseio.com/.json"

response1 = requests.get(firebase_url1)

memory1 = response1.json()

print("Memory fetched from Firebase:")
print(memory1)

