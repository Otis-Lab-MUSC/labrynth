#include "Device.h"
#include "Laser.h"
#include <Arduino.h> 

extern Laser laser;
extern bool programIsRunning;
extern long unsigned int differenceFromStartTime; 

void manageLaser(Laser &laser) {
  if (laser.getStimState() == ACTIVE && laser.getStimAction() == ON) {
    laser.on();
  } else {
    laser.off();
  }
}

void logStim(Laser &laser) {
  if (laser.getStimLog() == false) {
    String log = "LASER,STIM,";
    if (differenceFromStartTime) {
      log += String(laser.getStimStart() - differenceFromStartTime) + ",";
      log += String(laser.getStimEnd() - differenceFromStartTime);
      Serial.println(log);
      laser.setStimLogged(true);
    } else {
      log += String(laser.getStimStart()) + ",";
      log += String(laser.getStimEnd());
      Serial.println(log);
      laser.setStimLogged(true);
    }
  }
}

bool inStimPeriod(unsigned long int currentMillis) {
  return currentMillis > laser.getStimStart() && currentMillis < laser.getStimEnd();
}

void stim(Laser &laser, unsigned long int currentMillis) {
  if (inStimPeriod(currentMillis) && laser.getCycleUp()) {
    laser.setStimState(ACTIVE);
    laser.setStimLogged(false);
    if (laser.getFrequency() == 1) { // equivalent to constant stim
      laser.setStimAction(ON);
    }
    else { // oscillate at freqency
      if (currentMillis > laser.getStimHalfCycleEnd()) {
        laser.setStimHalfCyclePeriod(currentMillis);
        laser.setStimAction(laser.getStimAction() == ON ? OFF : ON); // set the inverse
      }
    }
  } else {
    laser.setStimState(INACTIVE);
    laser.setStimAction(OFF);
    if (!laser.getStimLog()) {
      logStim(laser);
      laser.setStimLogged(true);
    }
  }
  manageLaser(laser);
}

void manageStim(Laser &laser) {
  if (laser.isArmed() && programIsRunning) {
    unsigned long currentMillis = millis();
    if (laser.getStimMode() == CYCLE) {
      if (laser.getStimStart() == 0 || currentMillis >= laser.getStimEnd()) {
        laser.setStimPeriod(currentMillis);
        laser.setCycleUp(!laser.getCycleUp());
      }
    }
    else if (laser.getStimMode() == ACTIVE_PRESS) {
      laser.setCycleUp(true);
    }
    stim(laser, currentMillis);
  }
}
