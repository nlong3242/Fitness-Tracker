package com.tsu2track.fitness_tracker;

/* How an exercise's sets are logged, i.e. which numbers a set has (V13):
   WEIGHT_REPS  kg and reps (Bench Press)
   REPS         reps only (Push-up)
   TIME         a time (Plank)
   DISTANCE_TIME a time and, optionally, a distance in km (Treadmill run).
   Cardio exercises are always DISTANCE_TIME. */
public enum LogType {
    WEIGHT_REPS, REPS, TIME, DISTANCE_TIME
}
