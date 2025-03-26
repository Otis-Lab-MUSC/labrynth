#include "Program_Utils.h"
#include "Device.h"
#include "Lever.h"
#include "LickCircuit.h"
#include "Laser.h"
#include "Pump.h"
#include "Cue.h"

extern unsigned long int traceIntervalLength;
extern unsigned long int differenceFromStartTime;
extern Lever leverRH, leverLH;
extern Cue cs;
extern Pump pump;
extern LickCircuit lickCircuit;
extern Laser laser;

void startProgram(byte pin) {
  Serial.println();
  Serial.println("========== PROGRAM START ==========");
  Serial.println();
  digitalWrite(pin, HIGH);            // trigger imaging to begin capturing frames
  delay(50);                          // short delay to make sure data is fully transmitted
  digitalWrite(pin, LOW);             // finish trigger
  differenceFromStartTime = millis(); // set offset to calculate timestamps from program start
}

void endProgram(byte pin) {
  Serial.println();
  Serial.println("========== PROGRAM END ==========");
  Serial.println();
  digitalWrite(pin, HIGH); // second trigger signals end of imaging
  delay(50);
  digitalWrite(pin, LOW);
  leverRH.disarm();
  leverLH.disarm();
  cs.disarm();
  pump.disarm();
  lickCircuit.disarm();
  laser.off();
}

void deliverReward(Lever *&lever, Cue *cue, Pump *pump, Laser *laser) {
  long int timestamp = millis();
  if (cue && cue->isArmed()) {
    cue->setOnTimestamp(timestamp);
    cue->setOffTimestamp(timestamp);
  }
  if (pump && pump->isArmed()) {
    pump->setInfusionPeriod(cue->getOffTimestamp(), traceIntervalLength);
  }
  if (laser && laser->isArmed()) {
    laser->setStimPeriod(timestamp);
    laser->setStimState(ACTIVE);
  }
}
