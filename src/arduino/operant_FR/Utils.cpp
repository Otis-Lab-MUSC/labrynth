#include "Utils.h"
#include "Device.h"
#include "Lever.h"
#include "Laser.h"
#include "Pump.h"
#include "Cue.h"

void connectionJingle(String connected, Cue &cue, bool &linkedToGUI) {
    if (connected == "LINK") {
        linkedToGUI = true;
        static int pitch = 500; // starting tone frequency
        for (int i = 0; i < 3; i++) {
            tone(cue.getPin(), pitch, 100);
            delay(100);
            noTone(cue.getPin());
            pitch += 500; // increase the frequency with each iteration
        }
        pitch = 500;              // reset the frequency
        Serial.println("LINKED"); // output connection status
    } else if (connected == "UNLINK") {
        linkedToGUI = false;
        static int pitch = 1500; // starting tone frequency
        for (int i = 0; i < 3; i++) {
            tone(cue.getPin(), pitch, 100);
            delay(100);
            noTone(cue.getPin());
            pitch -= 500; // decrease the frequency
        }
        pitch = 1500;               // reset the frequency
        Serial.println("UNLINKED"); // output connection status
    }
}

void pingDevice(unsigned long &previousPing, const unsigned long pingInterval) {
    unsigned long currentMillis = millis();
    if (currentMillis - previousPing >= pingInterval) {
        previousPing = currentMillis;
        Serial.println("ping");
    }
}

extern Lever *activeLever; 
extern Lever *inactiveLever;
extern Laser laser;      

void manageCue(Cue *cue)
{
  /*

     Controls cue tone operation.

     @param Cue *cue, the optional cue speaker object of interest
     @function, if the cue is armed and current time stamp is during the assigned tone time period, speaker turns on, otherwise turns the cue off

  */
  long int timestamp = millis();
  if (cue)
  {
    if (cue->isArmed())
    { // cue must be armed in order to run
      if (timestamp <= cue->getOffTimestamp() && timestamp >= cue->getOnTimestamp())
      { // if current time stamp is during the tone interval
        cue->on(); // turn on cue
        cue->setRunning(true);
      }
      else
      { // if the time stamp is not in a tone interval
        cue->off(); // turn cue off
        cue->setRunning(false);
      }
    }
  }
}

void managePump(Pump *pump)
{
  /*

     Controls pump operation; similar to 'manageCue(Cue &cue)'.

     @param *pump, pump of interest is also not a required parameter for this function to run, as this function gets fed into another method where the pump is not required
     @function, turns the pump on during the infusion period, otherwise keeps it off

  */
  long int timestamp = millis();
  if (pump->isArmed())
  { // if the pump is armed and the laser is not armed...
    if (timestamp <= pump->getInfusionEndTimestamp() && timestamp >= pump->getInfusionStartTimestamp())
    { // if the current time stamp is within the infusion time period...
      pump->on(); // turn the pump on
      pump->setRunning(true);
    }
    else
    { // outside the infusion time stamp
      pump->off(); // turn the pump off
      pump->setRunning(false);
    }
  }
}

void pulseLaser(Laser &laser, unsigned long currentMillis) {
  unsigned long halfCycle = laser.getDuration() / laser.getFrequency() / 2;

  if (laser.getStimState() == ACTIVE) {
    if (currentMillis - laser.getPreviousHalfCycle() >= halfCycle) {
      laser.setPreviousHalfCycle(currentMillis);
      if (laser.getLaserState() == OFF) {
        laser.setLaserState(ON);
      }
      else {
        laser.setLaserState(OFF);
      }
    }
    if (laser.getLaserState() == ON) {
      laser.on();
    } else {
      laser.off();
    }
  }
  else {
    laser.setLaserState(OFF);
    laser.off();
  } 
}

void oscillateLaser(unsigned long currentMillis) {
    if (currentMillis - laser.getPreviousStim() >= laser.getDuration()) {
        if (laser.getStimState() == ACTIVE) { 
            laser.setStimState(INACTIVE);
            laser.setStimEndTimestamp(currentMillis);
            String laserEntry = "LASER,STIM," + String(laser.getStimStartTimestamp() - differenceFromStartTime) + ",";
            laserEntry += String(laser.getStimEndTimestamp() - differenceFromStartTime);
            Serial.println(laserEntry);
        } 
        else if (laser.getStimState() == INACTIVE) { 
            laser.setStimState(ACTIVE);
            laser.setStimStartTimestamp(currentMillis);
        }
    }
    pulseLaser(laser, currentMillis);
}

void rewardLaser(Lever *&lever, unsigned long currentMillis) {
    if (laser.getStimState() == ACTIVE) {
        if (currentMillis <= laser.getRewardStimEndTimestamp()) {
            if (laser.getLaserState() == OFF) {
                laser.setStimStartTimestamp(currentMillis);
                laser.setLaserState(ON);
            }
            laser.on();
        } 
        else {
            laser.setStimState(INACTIVE);
            laser.setStimEndTimestamp(currentMillis);
            String laserEntry = "LASER,STIM," + String(laser.getStimStartTimestamp() - differenceFromStartTime) + ",";
            laserEntry += String(laser.getStimEndTimestamp() - differenceFromStartTime);
            Serial.println(laserEntry);
        }
    } 
    else {
        laser.setLaserState(OFF);
        laser.off();
    }
}

void manageLaser(Laser &laser) {    
  if (laser.isArmed() && programIsRunning) {
    unsigned long currentMillis = millis();
    if (laser.getStimMode() == CYCLE) {
      oscillateLaser(currentMillis);
    }
    if (laser.getStimMode() == REWARD) {
      rewardLaser(activeLever, currentMillis);
    }
  }
}
