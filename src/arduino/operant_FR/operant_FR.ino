#define SKETCH_NAME "operant_FR.ino"
#define VERSION "v1.0.0"

/* ++++++++++++++++++++ INFORMATION ++++++++++++++++++++
  Meta data:
  Josh Boquiren (@thejoshbq on GitHub), Otis Lab

  "Unless the Lord builds the house, those who build it labor in vain.
  Unless the Lord watches over the city, the watchman stays awake in vain."
  Psalm 127:1

  ---------------------------------------------------------------------
  Program notes:
  - An active lever press triggers a cue tone, followed by a trace interval and pump infusion, and will be labeled as "ACTIVE"
  - Presses that occur during the cue tone, trace interval, pump infusion, or timeout period will be labeled as a "TIMEOUT" press
  - All other presses will be denoted as "INACTIVE"
  - Timestamps are adjusted to the start of the program once the program is started (adusted timestamp = current timestamp - program start time)

  ---------------------------------------------------------------------
  Defaults:
  - ratio, 1 reward:1 active press
  - trace interval length, 0ms (time between tone and infusion)
  - timeout period length, 20000ms (time from cue tone end)
  - cue tone length, 1600ms
  - infusion length, 2000ms
  - active lever, right-hand lever
  - laser pulse duration, 30000ms

  ---------------------------------------------------------------------
  Current pin configuration:
  - Pin 2, trigger for frame timestamp input signals
  - Pin 3 (PWM capable pin), conditioned stimulus speaker (denoted as "cs") and speaker for linked/unlinked jingle
  - Pin 4, pump
  - Pin 5, lick circuit
  - Pin 6, laser
  - Pin 9, trigger for imaging program start and stop
  - Pin 10, right-hand lever
  - Pin 13, left-hand lever


  ---------------------------------------------------------------------
  Sections:
  - Section 1: Definitions and configurations
  - Section 2: setup(), loop(), and sendSetupJSON()
  - Section 3: Serial commands library for this module
  - Section 4: Main program structure

  ++++++++++++++++++++ INFORMATION ++++++++++++++++++++ */



// =======================================================
// ====================== SECTION 1 ======================
// =======================================================

// Libraries
#include <Arduino.h>
#include <SoftwareSerial.h>
#include <ArduinoJson.h>
#include "Device.h"
#include "Laser.h"
#include "Laser_Utils.h"
#include "Lever.h"
#include "Lever_Utils.h"
#include "Cue.h"
#include "Cue_Utils.h"
#include "Pump.h"
#include "Pump_Utils.h"
#include "LickCircuit.h"
#include "LickCircuit_Utils.h"
#include "Utils.h"
#include "Program_Utils.h"

// Pin definitions
const byte RH_LEVER_PIN = 10;
const byte LH_LEVER_PIN = 13;
const byte CS_PIN = 3;
const byte PUMP_PIN = 4;
const byte IMAGING_TRIGGER = 9;
const byte TIMESTAMP_TRIGGER = 2;
const byte LICK_CIRCUIT_PIN = 5;
const byte LASER_PIN = 6;

// Class instantiations for components
Lever leverRH(RH_LEVER_PIN);
Lever leverLH(LH_LEVER_PIN);
Lever *activeLever = &leverRH; // pointer variable that stores a Lever object as the active lever
Lever *inactiveLever = &leverLH; // pointer variable that stores a Lever object as the inactive lever
Cue cs(CS_PIN);
Pump pump(PUMP_PIN);
LickCircuit lickCircuit(LICK_CIRCUIT_PIN);
Laser laser(LASER_PIN);

// Global Boolean variables
bool setupFinished = false; // marks setup completion
bool programIsRunning = false; // marks if the program is active or inactivate
bool linkedToGUI = false; // marks successful connection to Python
bool collectFrames = false; // marks whether or not to collect frame signals
volatile bool frameSignalReceived = false; // stores if a signal was recieved from the frame input pin

// Global int variables
unsigned long baudrate = 115200; // baudrate for data transmission speed
unsigned long int differenceFromStartTime; // the difference between the time the Arduino was first powered up from when the program was started
unsigned long int traceIntervalLength = 0; // time between cue tone and infusion
unsigned long int timeoutIntervalLength = 20000; // period after an active press in which a reward is unavailable
unsigned long int timeoutIntervalStart; // int variable to store timeout interval start timestamp
unsigned long int timeoutIntervalEnd;   // int variable to store timeout interval end timestamp
unsigned long previousPing = 0; // stores last time a ping was sent
const long pingInterval = 30000; // interval at which to send a ping (milliseconds)
volatile unsigned long int frameSignalTimestamp = 0; // variable that stores the frame input timestamp
int fRatio = 1; // denotes fixed ratio
int pressCount = 0;



// =======================================================
// ====================== SECTION 2 ======================
// =======================================================

// Setup
void setup() {
  // 2P setup
  pinMode(IMAGING_TRIGGER, OUTPUT);
  pinMode(TIMESTAMP_TRIGGER, INPUT);
  attachInterrupt(digitalPinToInterrupt(TIMESTAMP_TRIGGER), frameSignalISR, RISING);

  // laser setup
  pinMode(laser.getPin(), OUTPUT);
  laser.disarm();
  laser.setDuration(30);
  laser.setFrequency(20);

  // RH lever setup
  pinMode(leverRH.getPin(), INPUT_PULLUP);
  leverRH.disarm();
  leverRH.setOrientation("RH");

  // LH lever setup
  pinMode(leverLH.getPin(), INPUT_PULLUP);
  leverLH.disarm();
  leverLH.setOrientation("LH");

  // CS setup
  pinMode(cs.getPin(), OUTPUT);
  cs.disarm();

  // pump setup
  pinMode(pump.getPin(), OUTPUT);
  pump.disarm();

  // lick circuit setup
  pinMode(lickCircuit.getPin(), INPUT);
  lickCircuit.disarm();

  // Serial connection
  Serial.begin(baudrate);
  delay(2000); // delay to avoid overloading buffer
  Serial.println(SKETCH_NAME);
  setupFinished = true;
}

// Loop
void loop()
{
  PROGRAM();
  monitorSerialCommands();
}

void sendSetupJSON() {
  StaticJsonDocument<200> doc;
  doc["DOC"] = SKETCH_NAME;
  doc["VERSION"] = VERSION;

  doc["TRACE INTERVAL LENGTH"] = traceIntervalLength;
  doc["TIMEOUT INTERVAL LENGTH"] = timeoutIntervalLength;
  doc["DELTA START TIME"] = differenceFromStartTime;
  doc["BAUDRATE"] = baudrate;

  doc["CS DURATION"] = cs.getDuration();
  doc["CS FREQUENCY"] = cs.getFrequency();
  doc["PUMP INFUSION LENGTH"] = pump.getInfusionDuration();
  doc["LASER STIM LENGTH"] = laser.getDuration();
  doc["LASER STIM FREQUENCY"] = laser.getFrequency();
  doc["LASER STIM MODE"] = laser.getStimMode();

  serializeJson(doc, Serial);
  Serial.println('\n');
}



// =======================================================
// ====================== SECTION 3 ======================
// =======================================================

#define COMMAND_BUFFER_SIZE 32
char commandBuffer[COMMAND_BUFFER_SIZE];

long extractParam(const char* cmd, const char* prefix) { // extracts a numeric parameter from a command (e.g., "SET_RATIO:5" -> 5)
    size_t prefixLen = strlen(prefix);
    if (strncmp(cmd, prefix, prefixLen) == 0) {
        const char* paramStart = cmd + prefixLen; 
        return atol(paramStart);
    }
    return 0;
}

void handleLink(const char* cmd) {
    connectionJingle("LINK", cs, linkedToGUI);
}

void handleUnlink(const char* cmd) {
    connectionJingle("UNLINK", cs, linkedToGUI);
}

void handleStartProgram(const char* cmd) {
    startProgram(IMAGING_TRIGGER);
    sendSetupJSON();
    programIsRunning = true;
}

void handleEndProgram(const char* cmd) {
    endProgram(IMAGING_TRIGGER);
    programIsRunning = false;
    delay(1000);
}

void handleSetRatio(const char* cmd) {
    long value = extractParam(cmd, "SET_RATIO:");
    fRatio = value;
}

void handleSetTimeoutPeriodLength(const char* cmd) {
    long value = extractParam(cmd, "SET_TIMEOUT_PERIOD_LENGTH:");
    timeoutIntervalLength = value;
}

void handleArmFrame(const char* cmd) {
    collectFrames = true;
}

void handleDisarmFrame(const char* cmd) {
    collectFrames = false;
}

void handleArmLeverRH(const char* cmd) {
    leverRH.arm();
}

void handleDisarmLeverRH(const char* cmd) {
    leverRH.disarm();
}

void handleActiveLeverRH(const char* cmd) {
    activeLever = &leverRH;
    inactiveLever = &leverLH;
    Serial.print(F("ACTIVE LEVER: "));
    Serial.println(activeLever->getOrientation());
}

void handleArmLeverLH(const char* cmd) {
    leverLH.arm();
}

void handleDisarmLeverLH(const char* cmd) {
    leverLH.disarm();
}

void handleActiveLeverLH(const char* cmd) {
    activeLever = &leverLH;
    inactiveLever = &leverRH;
    Serial.print(F("ACTIVE LEVER: "));
    Serial.println(activeLever->getOrientation());
}

void handleArmCS(const char* cmd) {
    cs.arm();
}

void handleDisarmCS(const char* cmd) {
    cs.disarm();
}

void handleSetFrequencyCS(const char* cmd) {
    long frequency = extractParam(cmd, "SET_FREQUENCY_CS:");
    cs.setFrequency(frequency);
}

void handleSetDurationCS(const char* cmd) {
    long duration = extractParam(cmd, "SET_DURATION_CS:");
    cs.setDuration(duration);
}

void handleArmPump(const char* cmd) {
    pump.arm();
}

void handleDisarmPump(const char* cmd) {
    pump.disarm();
}

void handleSetTraceInterval(const char* cmd) {
    long value = extractParam(cmd, "SET_TRACE_INTERVAL:");
    traceIntervalLength = value;
}

void handlePumpTestOn(const char* cmd) {
    pump.on();
}

void handlePumpTestOff(const char* cmd) {
    pump.off();
}

void handleArmLaser(const char* cmd) {
    laser.arm();
}

void handleDisarmLaser(const char* cmd) {
    laser.disarm();
}

void handleLaserTestOn(const char* cmd) {
    laser.on();
}

void handleLaserTestOff(const char* cmd) {
    laser.off();
}

void handleLaserStimModeCycle(const char* cmd) {
    laser.setStimMode(CYCLE);
}

void handleLaserStimModeActivePress(const char* cmd) {
    laser.setStimMode(ACTIVE_PRESS);
}

void handleLaserDuration(const char* cmd) {
    long duration = extractParam(cmd, "LASER_DURATION:");
    laser.setDuration(duration);
}

void handleLaserFrequency(const char* cmd) {
    long frequency = extractParam(cmd, "LASER_FREQUENCY:");
    laser.setFrequency(frequency);
}

void handleArmLickCircuit(const char* cmd) {
    lickCircuit.arm();
}

void handleDisarmLickCircuit(const char* cmd) {
    lickCircuit.disarm();
}

typedef void (*CommandHandler)(const char*); 

struct Command {
    const char* prefix;
    CommandHandler handler;
};

Command commands[] = {
    {"LINK", handleLink},
    {"UNLINK", handleUnlink},
    {"START-PROGRAM", handleStartProgram},
    {"END-PROGRAM", handleEndProgram},
    {"SET_RATIO:", handleSetRatio},
    {"SET_TIMEOUT_PERIOD_LENGTH:", handleSetTimeoutPeriodLength},
    {"ARM_FRAME", handleArmFrame},
    {"DISARM_FRAME", handleDisarmFrame},
    {"ARM_LEVER_RH", handleArmLeverRH},
    {"DISARM_LEVER_RH", handleDisarmLeverRH},
    {"ACTIVE_LEVER_RH", handleActiveLeverRH},
    {"ARM_LEVER_LH", handleArmLeverLH},
    {"DISARM_LEVER_LH", handleDisarmLeverLH},
    {"ACTIVE_LEVER_LH", handleActiveLeverLH},
    {"ARM_CS", handleArmCS},
    {"DISARM_CS", handleDisarmCS},
    {"SET_FREQUENCY_CS:", handleSetFrequencyCS},
    {"SET_DURATION_CS:", handleSetDurationCS},
    {"ARM_PUMP", handleArmPump},
    {"DISARM_PUMP", handleDisarmPump},
    {"SET_TRACE_INTERVAL:", handleSetTraceInterval},
    {"PUMP_TEST_ON", handlePumpTestOn},
    {"PUMP_TEST_OFF", handlePumpTestOff},
    {"ARM_LASER", handleArmLaser},
    {"DISARM_LASER", handleDisarmLaser},
    {"LASER_TEST_ON", handleLaserTestOn},
    {"LASER_TEST_OFF", handleLaserTestOff},
    {"LASER_STIM_MODE_CYCLE", handleLaserStimModeCycle},
    {"LASER_STIM_MODE_ACTIVE-PRESS", handleLaserStimModeActivePress},
    {"LASER_DURATION:", handleLaserDuration},
    {"LASER_FREQUENCY:", handleLaserFrequency},
    {"ARM_LICK_CIRCUIT", handleArmLickCircuit},
    {"DISARM_LICK_CIRCUIT", handleDisarmLickCircuit},
};

void monitorSerialCommands() {
    if (setupFinished && Serial.available() > 0) {
        size_t bytesRead = Serial.readBytesUntil('\n', commandBuffer, COMMAND_BUFFER_SIZE - 1);
        commandBuffer[bytesRead] = '\0'; // null-terminate the string
        bool commandHandled = false;
        for (size_t i = 0; i < sizeof(commands) / sizeof(commands[0]); i++) {
            const Command& cmd = commands[i];
            size_t prefixLen = strlen(cmd.prefix);
            if (cmd.prefix[prefixLen - 1] == ':') {
                if (strncmp(commandBuffer, cmd.prefix, prefixLen) == 0) {
                    cmd.handler(commandBuffer);
                    commandHandled = true;
                    break;
                }
            } else {
                if (strcmp(commandBuffer, cmd.prefix) == 0) {
                    cmd.handler(commandBuffer);
                    commandHandled = true;
                    break;
                }
            }
        }
        if (!commandHandled) {
            Serial.print(F(">>> Command ["));
            Serial.print(commandBuffer);
            Serial.println(F("] is invalid."));
        }
        delay(50); // short delay to ensure command processing
    }
}



// =======================================================
// ====================== SECTION 4 ======================
// =======================================================

void PROGRAM() {
  if (linkedToGUI) {
    monitorPressing(programIsRunning, activeLever, &cs, &pump, &laser); // monitor pressing for active lever requires cs and pump parameter
    monitorPressing(programIsRunning, inactiveLever, nullptr, nullptr, nullptr); // monitor pressing for inactive lever does not require cs or pump parameter
    monitorLicking(lickCircuit);
    manageStim(laser);
    handleFrameSignal();
    pingDevice(previousPing, pingInterval); // pings connected device to make sure serial connection is OK
  }
}
