#ifndef LEVER_UTILS_H
#define LEVER_UTILS_H

#include "Lever.h" 
#include "Cue.h"
#include "Cue_Utils.h"
#include "Pump.h"   
#include "Pump_Utils.h"
#include "Laser.h"  
#include "Program_Utils.h"
#include <Arduino.h>  

void pressingDataEntry(Lever *&lever, Pump *pump);
void definePressActivity(bool programRunning, Lever *&lever, Cue *cue, Pump *pump, Laser *laser);
void monitorPressing(bool programRunning, Lever *&lever, Cue *cue, Pump *pump, Laser *laser);

#endif
