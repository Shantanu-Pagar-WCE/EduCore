/* =========================================================
   EDUCORE - JAVASCRIPT
   8-BIT ASSEMBLY SIMULATOR

   Supported Instructions:
   MOV, LDR, STR, ADD, SUB, END

   Registers:
   R0 - R7

   Data Size:
   8-bit
   ========================================================= */


/* =========================================================
   1. GET HTML ELEMENTS
   ========================================================= */

const codeEditor = document.getElementById("codeEditor");
const output = document.getElementById("output");

const compileBtn = document.getElementById("compileBtn");
const runBtn = document.getElementById("runBtn");
const showBtn = document.getElementById("showBtn");
const helpBtn = document.getElementById("helpBtn");
const clearBtn = document.getElementById("clearBtn");
const documentationBtn =
    document.getElementById("documentationBtn");


/* =========================================================
   1B. FIREBASE REALTIME DATABASE CONFIG
   =========================================================

   Every time a program compiles successfully, the parsed
   instructions are pushed to this Realtime Database under
   the "programs" node, in the shape:

   programs
   ├── l1
   │   ├── operand: MOV
   │   ├── destination: R1
   │   └── source: #10
   ├── l2
   │   ...

   Plain REST calls (fetch) are used so no extra SDK script
   tag is required and nothing else on the page changes.
   ========================================================= */

const FIREBASE_DB_URL =
    "https://eduseth-86c45-default-rtdb.firebaseio.com";


/* =========================================================
   2. CPU STATE
   ========================================================= */

// 8 registers: R0 - R7
let registers = {};

// SRAM / working memory
// 8-bit, 256 memory locations
let memory = new Uint8Array(256);

// Compiled instructions
let compiledProgram = [];

let isCompiled = false;
let isExecuted = false;


/* =========================================================
   3. ADDITIONAL MEMORY
   =========================================================

   FRAM  -> Non-Volatile
   SRAM  -> Volatile
   FLASH -> Non-Volatile

   These are currently simulated memories.
   ========================================================= */

let framMemory = new Uint8Array(256);
let flashMemory = new Uint8Array(256);


/* =========================================================
   4. RESET REGISTERS
   ========================================================= */

function resetRegisters() {

    registers = {};

    for (let i = 0; i < 8; i++) {

        registers["R" + i] = 0;
    }
}


/* =========================================================
   5. RESET SRAM
   ========================================================= */

function resetMemory() {

    memory = new Uint8Array(256);
}


/* =========================================================
   6. INITIALIZE FRAM / FLASH
   ========================================================= */

function initializeAdditionalMemory() {

    /*
       Demo values for FRAM
       These can later be connected
       to your actual EduCore memory.
    */

    framMemory[0] = 25;
    framMemory[1] = 10;
    framMemory[2] = 50;
    framMemory[3] = 100;
    framMemory[4] = 75;
    framMemory[5] = 10;
    framMemory[6] = 50;
    framMemory[7] = 100;

    /*
       Demo values for FLASH
       These can later be connected
       to your actual EduCore memory.
    */

    flashMemory[0] = 10;
    flashMemory[1] = 20;
    flashMemory[2] = 30;
    flashMemory[3] = 40;
    flashMemory[4] = 50;
    flashMemory[5] = 20;
    flashMemory[6] = 30;
    flashMemory[7] = 40;
}


/* =========================================================
   7. RESET COMPLETE CPU
   ========================================================= */

function resetCPU() {

    resetRegisters();
    resetMemory();
}


/* =========================================================
   8. DISPLAY OUTPUT
   ========================================================= */

function setOutput(text, error = false) {

    output.textContent = text;

    if (error) {

        output.style.color = "#c62828";

    } else {

        output.style.color = "#087d27";
    }
}


/* =========================================================
   9. CHECK REGISTER
   ========================================================= */

function isRegister(value) {

    return /^R[0-7]$/i.test(value.trim());
}


/* =========================================================
   10. CONVERT VALUE TO 8-BIT
   ========================================================= */

function to8Bit(value) {

    return value & 0xFF;
}


/* =========================================================
   11. PARSE IMMEDIATE VALUE
   =========================================================

   Examples:

   #10
   #50
   #255
   #0xFF
   ========================================================= */

function parseImmediate(value) {

    value = value.trim();

    if (!value.startsWith("#")) {

        return null;
    }

    value = value.substring(1);

    let number;


    // Hexadecimal

    if (/^0x[0-9a-f]+$/i.test(value)) {

        number = parseInt(value, 16);

    }


    // Decimal
    else if (/^\d+$/.test(value)) {

        number = parseInt(value, 10);

    } else {

        return null;
    }


    // 8-bit range

    if (number < 0 || number > 255) {

        return null;
    }

    return number;
}


/* =========================================================
   12. MEMORY ADDRESS
   =========================================================

   Supported:

   [100]
   [R2]
   [R2,#4]
   ========================================================= */

function getMemoryAddress(operand) {

    operand =
        operand.trim().replace(/\s+/g, "");


    // Must have [ ]

    if (
        !operand.startsWith("[") ||
        !operand.endsWith("]")
    ) {

        return null;
    }


    let inside =
        operand.substring(
            1,
            operand.length - 1
        );


    /* ---------- [100] ---------- */

    if (/^\d+$/.test(inside)) {

        let address =
            parseInt(inside, 10);


        if (
            address >= 0 &&
            address < 256
        ) {

            return address;
        }


        return null;
    }


    /* ---------- [R2] ---------- */

    if (/^R[0-7]$/i.test(inside)) {

        return registers[
            inside.toUpperCase()
        ];
    }


    /* ---------- [R2,#4] ---------- */

    let match =
        inside.match(
            /^R([0-7]),#(\d+)$/i
        );


    if (match) {

        let base =
            registers["R" + match[1]];


        let offset =
            parseInt(match[2], 10);


        let address =
            base + offset;


        if (
            address >= 0 &&
            address < 256
        ) {

            return address;
        }
    }


    return null;
}


/* =========================================================
   13. CHECK MEMORY SYNTAX
   ========================================================= */

function isMemorySyntaxValid(operand) {

    operand =
        operand.trim().replace(/\s+/g, "");


    // [100]

    if (/^\[\d+\]$/.test(operand)) {

        let address =
            parseInt(
                operand.substring(
                    1,
                    operand.length - 1
                )
            );


        return (
            address >= 0 &&
            address < 256
        );
    }


    // [R2]

    if (/^\[R[0-7]\]$/i.test(operand)) {

        return true;
    }


    // [R2,#4]

    if (
        /^\[R[0-7],#\d+\]$/i.test(
            operand
        )
    ) {

        return true;
    }


    return false;
}


/* =========================================================
   14. SPLIT OPERANDS
   ========================================================= */

function splitOperands(text) {

    let operands = [];

    let current = "";

    let bracketDepth = 0;


    for (let char of text) {

        if (char === "[") {

            bracketDepth++;
        }


        if (char === "]") {

            bracketDepth--;
        }


        if (
            char === "," &&
            bracketDepth === 0
        ) {

            operands.push(
                current.trim()
            );

            current = "";

        } else {

            current += char;
        }
    }


    if (current.trim() !== "") {

        operands.push(
            current.trim()
        );
    }


    return operands;
}


/* =========================================================
   15. PARSE PROGRAM
   ========================================================= */

function parseProgram(sourceCode) {

    const lines =
        sourceCode.split("\n");


    let program = [];

    let errors = [];

    let foundEnd = false;


    lines.forEach(
        (rawLine, index) => {

            const lineNumber =
                index + 1;


            // Remove comments

            let line =
                rawLine
                .split(";")[0]
                .trim();


            // Empty line

            if (line === "") {

                return;
            }


            /* ---------- GET INSTRUCTION ---------- */

            let firstSpace =
                line.search(/\s/);


            let instruction;

            let operandText;


            if (firstSpace === -1) {

                instruction =
                    line.toUpperCase();

                operandText = "";

            } else {

                instruction =
                    line
                    .substring(
                        0,
                        firstSpace
                    )
                    .toUpperCase();


                operandText =
                    line
                    .substring(firstSpace)
                    .trim();
            }


            let operands =
                splitOperands(
                    operandText
                );


            /* =================================================
               MOV
               ================================================= */

            if (instruction === "MOV") {

                if (operands.length !== 2) {

                    errors.push(
                        `Line ${lineNumber}: MOV requires 2 operands.`
                    );

                } else if (
                    !isRegister(
                        operands[0]
                    )
                ) {

                    errors.push(
                        `Line ${lineNumber}: Invalid destination register.`
                    );

                } else {

                    let source =
                        operands[1];


                    let immediate =
                        parseImmediate(
                            source
                        );


                    if (
                        immediate === null &&
                        !isRegister(source)
                    ) {

                        errors.push(
                            `Line ${lineNumber}: Invalid MOV source.`
                        );
                    }
                }
            }


            /* =================================================
               LDR
               ================================================= */
            else if (
                instruction === "LDR"
            ) {

                if (
                    operands.length !== 2
                ) {

                    errors.push(
                        `Line ${lineNumber}: LDR requires 2 operands.`
                    );
                } else if (
                    !isRegister(
                        operands[0]
                    )
                ) {

                    errors.push(
                        `Line ${lineNumber}: Invalid LDR destination register.`
                    );
                } else if (
                    !isMemorySyntaxValid(
                        operands[1]
                    )
                ) {

                    errors.push(
                        `Line ${lineNumber}: Invalid memory address.`
                    );
                }
            }


            /* =================================================
               STR
               ================================================= */
            else if (
                instruction === "STR"
            ) {

                if (
                    operands.length !== 2
                ) {

                    errors.push(
                        `Line ${lineNumber}: STR requires 2 operands.`
                    );
                } else if (
                    !isRegister(
                        operands[0]
                    )
                ) {

                    errors.push(
                        `Line ${lineNumber}: Invalid STR source register.`
                    );
                } else if (
                    !isMemorySyntaxValid(
                        operands[1]
                    )
                ) {

                    errors.push(
                        `Line ${lineNumber}: Invalid memory address.`
                    );
                }
            }


            /* =================================================
               ADD / SUB
               ================================================= */
            else if (
                instruction === "ADD" ||
                instruction === "SUB"
            ) {

                if (
                    operands.length !== 3
                ) {

                    errors.push(
                        `Line ${lineNumber}: ${instruction} requires 3 registers.`
                    );
                } else {

                    for (
                        let operand of operands
                    ) {

                        if (
                            !isRegister(
                                operand
                            )
                        ) {

                            errors.push(
                                `Line ${lineNumber}: ${instruction} accepts only R0-R7.`
                            );

                            break;
                        }
                    }
                }
            }


            /* =================================================
               END
               ================================================= */
            else if (
                instruction === "END"
            ) {

                if (
                    operands.length !== 0
                ) {

                    errors.push(
                        `Line ${lineNumber}: END takes no operands.`
                    );
                }


                foundEnd = true;
            }


            /* =================================================
               UNKNOWN INSTRUCTION
               ================================================= */
            else {

                errors.push(
                    `Line ${lineNumber}: Unknown instruction "${instruction}".`
                );
            }


            program.push({

                instruction: instruction,

                operands: operands,

                lineNumber: lineNumber
            });
        }
    );


    /* ---------- END CHECK ---------- */

    if (!foundEnd) {

        errors.push(
            "Program must contain END instruction."
        );
    }


    return {

        program: program,

        errors: errors
    };
}


/* =========================================================
   15B. BUILD FIREBASE PROGRAM OBJECT
   =========================================================

   Turns the parsed program array into the
   l1 / l2 / l3 ... shape used by the Realtime
   Database, e.g.:

   {
     l1: { operand: "MOV", destination: "R1", source: "#10" },
     l2: { operand: "MOV", destination: "R2", source: "#20" },
     l3: { operand: "ADD", destination: "R3", source: "R1,R2" },
     ...
     l5: { operand: "END", destination: null, source: null }
   }
   ========================================================= */

function buildFirebaseProgram(program) {

    const data = {};

    program.forEach(function(instructionData, index) {

        const key = "l" + (index + 1);

        const operands = instructionData.operands;

        const destination =
            operands.length > 0 ?
            operands[0] :
            null;

        const source =
            operands.length > 1 ?
            operands.slice(1).join(",") :
            null;

        data[key] = {
            operand: instructionData.instruction,
            destination: destination,
            source: source
        };
    });

    return data;
}


/* =========================================================
   15C. SYNC PROGRAM TO FIREBASE
   =========================================================

   Fire-and-forget REST call to the Realtime Database.
   Runs quietly in the background after a successful
   compile and never blocks or changes existing
   compile/run/show behaviour. Failures are only logged
   to the console.
   ========================================================= */

function syncProgramToFirebase(program) {

    const firebaseProgram =
        buildFirebaseProgram(program);

    fetch(
            FIREBASE_DB_URL + "/programs.json", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(firebaseProgram)
            }
        )
        .then(function(response) {

            if (!response.ok) {

                throw new Error(
                    "Firebase sync failed with status " +
                    response.status
                );
            }

            return response.json();
        })
        .then(function() {

            console.log(
                "EduCore: program synced to Firebase."
            );
        })
        .catch(function(error) {

            console.error(
                "EduCore: Firebase sync error -",
                error
            );
        });
}


/* =========================================================
   16. COMPILE
   ========================================================= */

function compileCode() {

    const sourceCode =
        codeEditor.value;


    const result =
        parseProgram(
            sourceCode
        );


    /* ---------- COMPILATION FAILED ---------- */

    if (
        result.errors.length > 0
    ) {

        isCompiled = false;

        compiledProgram = [];


        setOutput(
            "Compilation Failed!\n\n" +
            result.errors.join("\n"),
            true
        );


        return false;
    }


    /* ---------- COMPILATION SUCCESS ---------- */

    compiledProgram =
        result.program;


    isCompiled = true;

    isExecuted = false;


    setOutput(
        "Compilation Successful!"
    );


    /* ---------- SYNC TO FIREBASE ---------- */

    syncProgramToFirebase(
        compiledProgram
    );


    return true;
}


/* =========================================================
   17. EXECUTE MOV
   ========================================================= */

function executeMOV(operands) {

    let destination =
        operands[0].toUpperCase();


    let source =
        operands[1];


    /* ---------- MOV R1,#10 ---------- */

    let immediate =
        parseImmediate(source);


    if (
        immediate !== null
    ) {

        registers[destination] =
            to8Bit(immediate);

        return;
    }


    /* ---------- MOV R1,R2 ---------- */

    if (
        isRegister(source)
    ) {

        registers[destination] =
            registers[
                source.toUpperCase()
            ];

        return;
    }


    throw new Error(
        "Invalid MOV source."
    );
}


/* =========================================================
   18. EXECUTE ADD
   ========================================================= */

function executeADD(operands) {

    let destination =
        operands[0].toUpperCase();


    let source1 =
        operands[1].toUpperCase();


    let source2 =
        operands[2].toUpperCase();


    registers[destination] =
        to8Bit(
            registers[source1] +
            registers[source2]
        );
}


/* =========================================================
   19. EXECUTE SUB
   ========================================================= */

function executeSUB(operands) {

    let destination =
        operands[0].toUpperCase();


    let source1 =
        operands[1].toUpperCase();


    let source2 =
        operands[2].toUpperCase();


    registers[destination] =
        to8Bit(
            registers[source1] -
            registers[source2]
        );
}


/* =========================================================
   20. EXECUTE LDR
   ========================================================= */

function executeLDR(operands) {

    let destination =
        operands[0].toUpperCase();


    let address =
        getMemoryAddress(
            operands[1]
        );


    if (address === null) {

        throw new Error(
            "Invalid LDR memory address."
        );
    }


    registers[destination] =
        memory[address];
}


/* =========================================================
   21. EXECUTE STR
   ========================================================= */

function executeSTR(operands) {

    let source =
        operands[0].toUpperCase();


    let address =
        getMemoryAddress(
            operands[1]
        );


    if (address === null) {

        throw new Error(
            "Invalid STR memory address."
        );
    }


    memory[address] =
        registers[source];
}


/* =========================================================
   22. RUN PROGRAM
   ========================================================= */

function runProgram() {


    /* ---------- COMPILE FIRST ---------- */

    if (!isCompiled) {

        let success =
            compileCode();


        if (!success) {

            return;
        }
    }


    /* ---------- RESET CPU ---------- */

    resetCPU();


    try {


        /* ---------- EXECUTE EACH INSTRUCTION ---------- */

        for (
            let instructionData of compiledProgram
        ) {


            let instruction =
                instructionData
                .instruction;


            let operands =
                instructionData
                .operands;


            switch (instruction) {


                /* ---------- MOV ---------- */

                case "MOV":

                    executeMOV(
                        operands
                    );

                    break;


                    /* ---------- LDR ---------- */

                case "LDR":

                    executeLDR(
                        operands
                    );

                    break;


                    /* ---------- STR ---------- */

                case "STR":

                    executeSTR(
                        operands
                    );

                    break;


                    /* ---------- ADD ---------- */

                case "ADD":

                    executeADD(
                        operands
                    );

                    break;


                    /* ---------- SUB ---------- */

                case "SUB":

                    executeSUB(
                        operands
                    );

                    break;


                    /* ---------- END ---------- */

                case "END":

                    isExecuted = true;

                    break;


                default:

                    throw new Error(
                        "Unknown instruction: " +
                        instruction
                    );
            }


            /* ---------- STOP AT END ---------- */

            if (
                instruction === "END"
            ) {

                break;
            }
        }


        /*
           RUN does not display register values.
           It only confirms execution.
        */

        setOutput(
            "Program Executed Successfully!"
        );


        isExecuted = true;


    } catch (error) {


        isExecuted = false;


        setOutput(
            "Runtime Error!\n\n" +
            error.message,
            true
        );
    }
}


/* =========================================================
   23. SHOW MEMORY SELECTION
   =========================================================

   SHOW button now opens:

   FRAM
   SRAM
   FLASH
   ========================================================= */

function showResults() {

    if (!isExecuted) {

        setOutput(
            "Nothing to show yet.\n\n" +
            "Compile and RUN your program first.",
            true
        );

        return;
    }


    const memorySelectModal =
        document.getElementById(
            "memorySelectModal"
        );


    if (memorySelectModal) {

        memorySelectModal.style.display =
            "flex";

    } else {

        console.error(
            "memorySelectModal not found."
        );
    }
}


/* =========================================================
   24. SHOW SELECTED MEMORY DATA
   ========================================================= */

function showMemoryData(type) {

    let selectedMemory;

    let title;

    let typeText;


    /* ---------- FRAM ---------- */

    if (type === "FRAM") {

        selectedMemory =
            framMemory;

        title =
            "FRAM MEMORY DATA";

        typeText =
            "Non-Volatile Memory";
    }


    /* ---------- SRAM ---------- */
    else if (type === "SRAM") {

        /*
           Existing "memory" variable
           is used as SRAM.
        */

        selectedMemory =
            memory;

        title =
            "SRAM MEMORY DATA";

        typeText =
            "Volatile Memory";
    }


    /* ---------- FLASH ---------- */
    else if (type === "FLASH") {

        selectedMemory =
            flashMemory;

        title =
            "FLASH MEMORY DATA";

        typeText =
            "Non-Volatile Memory";
    } else {

        return;
    }


    /* =====================================================
       GET POPUP ELEMENTS
       ===================================================== */

    const memoryTitle =
        document.getElementById(
            "memoryTitle"
        );


    const memoryType =
        document.getElementById(
            "memoryType"
        );


    const memoryTableBody =
        document.getElementById(
            "memoryTableBody"
        );


    if (
        !memoryTitle ||
        !memoryType ||
        !memoryTableBody
    ) {

        console.error(
            "Memory popup elements not found."
        );

        return;
    }


    /* =====================================================
       UPDATE HEADING
       ===================================================== */

    memoryTitle.textContent =
        title;


    memoryType.textContent =
        typeText;


    /* =====================================================
       CLEAR OLD TABLE
       ===================================================== */

    memoryTableBody.innerHTML =
        "";


    /* =====================================================
       DISPLAY MEMORY DATA

       Only non-zero locations are displayed.
       ===================================================== */

    let hasData = false;


    for (
        let address = 0; address < selectedMemory.length; address++
    ) {


        if (
            selectedMemory[address] !== 0
        ) {

            hasData = true;


            const row =
                document.createElement(
                    "tr"
                );


            const addressCell =
                document.createElement(
                    "td"
                );


            const dataCell =
                document.createElement(
                    "td"
                );


            addressCell.textContent =
                address;


            dataCell.textContent =
                selectedMemory[address];


            row.appendChild(
                addressCell
            );


            row.appendChild(
                dataCell
            );


            memoryTableBody.appendChild(
                row
            );
        }
    }


    /* =====================================================
       IF MEMORY IS EMPTY
       ===================================================== */

    if (!hasData) {

        const row =
            document.createElement(
                "tr"
            );


        const cell =
            document.createElement(
                "td"
            );


        cell.colSpan = 2;


        cell.textContent =
            "No data stored in memory.";


        cell.style.textAlign =
            "center";


        row.appendChild(
            cell
        );


        memoryTableBody.appendChild(
            row
        );
    }


    /* =====================================================
       CLOSE MEMORY SELECTION
       ===================================================== */

    const memorySelectModal =
        document.getElementById(
            "memorySelectModal"
        );


    memorySelectModal.style.display =
        "none";


    /* =====================================================
       OPEN MEMORY DATA POPUP
       ===================================================== */

    const memoryDataModal =
        document.getElementById(
            "memoryDataModal"
        );


    memoryDataModal.style.display =
        "flex";
}


/* =========================================================
   25. CLOSE MEMORY SELECTION POPUP
   ========================================================= */

function closeMemorySelection() {

    const modal =
        document.getElementById(
            "memorySelectModal"
        );


    if (modal) {

        modal.style.display =
            "none";
    }
}


/* =========================================================
   26. CLOSE MEMORY DATA POPUP
   ========================================================= */

function closeMemoryData() {

    const modal =
        document.getElementById(
            "memoryDataModal"
        );


    if (modal) {

        modal.style.display =
            "none";
    }
}


/* =========================================================
   27. MEMORY BUTTON EVENTS
   ========================================================= */

document.addEventListener(
    "click",
    function(event) {


        /* ---------- FRAM ---------- */

        if (
            event.target.id ===
            "framBtn"
        ) {

            showMemoryData(
                "FRAM"
            );
        }


        /* ---------- SRAM ---------- */

        if (
            event.target.id ===
            "sramBtn"
        ) {

            showMemoryData(
                "SRAM"
            );
        }


        /* ---------- FLASH ---------- */

        if (
            event.target.id ===
            "flashBtn"
        ) {

            showMemoryData(
                "FLASH"
            );
        }


        /* ---------- CLOSE SELECTION ---------- */

        if (
            event.target.id ===
            "closeMemorySelect"
        ) {

            closeMemorySelection();
        }


        /* ---------- CLOSE DATA ---------- */

        if (
            event.target.id ===
            "closeMemoryData"
        ) {

            closeMemoryData();
        }
    }
);


/* =========================================================
   28. CLOSE POPUP WHEN CLICKING OUTSIDE
   ========================================================= */

window.addEventListener(
    "click",
    function(event) {


        const memorySelectModal =
            document.getElementById(
                "memorySelectModal"
            );


        const memoryDataModal =
            document.getElementById(
                "memoryDataModal"
            );


        if (
            event.target ===
            memorySelectModal
        ) {

            memorySelectModal.style.display =
                "none";
        }


        if (
            event.target ===
            memoryDataModal
        ) {

            memoryDataModal.style.display =
                "none";
        }
    }
);


/* =========================================================
   29. HELP
   ========================================================= */

function showHelp() {

    setOutput(

        "EDUCORE ASSEMBLY HELP\n\n" +

        "MOV R1, #10\n" +
        "  Move immediate value into R1.\n\n" +

        "MOV R1, R2\n" +
        "  Copy R2 into R1.\n\n" +

        "LDR R1, [100]\n" +
        "  Load Memory[100] into R1.\n\n" +

        "STR R1, [100]\n" +
        "  Store R1 into Memory[100].\n\n" +

        "ADD R3, R1, R2\n" +
        "  R3 = R1 + R2\n\n" +

        "SUB R3, R1, R2\n" +
        "  R3 = R1 - R2\n\n" +

        "END\n" +
        "  End the program.\n\n" +

        "EduCore Architecture:\n" +
        "• 8-bit Data\n" +
        "• 8 Registers: R0-R7\n" +
        "• Memory: 256 locations"
    );
}


/* =========================================================
   30. CLEAR OUTPUT
   ========================================================= */

function clearOutput() {

    setOutput(
        "Output cleared. Ready for the next program."
    );
}


/* =========================================================
   31. DOCUMENTATION
   ========================================================= */

function showDocumentation() {

    setOutput(

        "EDUCORE DOCUMENTATION\n\n" +

        "Data Width: 8-bit\n" +

        "Registers: R0-R7\n\n" +

        "Supported Instructions:\n" +

        "MOV - Move data\n" +

        "LDR - Load data from memory\n" +

        "STR - Store data to memory\n" +

        "ADD - Addition\n" +

        "SUB - Subtraction\n" +

        "END - End program\n\n" +

        "Workflow:\n" +

        "Write Code → Compile → Run → Show"
    );
}


/* =========================================================
   32. BUTTON EVENTS
   ========================================================= */

compileBtn.addEventListener(
    "click",
    compileCode
);


runBtn.addEventListener(
    "click",
    runProgram
);


/*
   IMPORTANT:

   SHOW now opens the memory-selection popup.
*/

showBtn.addEventListener(
    "click",
    showResults
);


helpBtn.addEventListener(
    "click",
    showHelp
);


clearBtn.addEventListener(
    "click",
    clearOutput
);


documentationBtn.addEventListener(
    "click",
    showDocumentation
);


/* =========================================================
   33. WHEN USER CHANGES CODE
   ========================================================= */

codeEditor.addEventListener(
    "input",
    function() {

        // Previous compilation is no longer valid

        isCompiled = false;

        isExecuted = false;
    }
);


/* =========================================================
   34. STARTUP
   ========================================================= */

resetCPU();

initializeAdditionalMemory();
