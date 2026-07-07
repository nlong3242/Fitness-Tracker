package com.tsu2track.fitness_tracker.dto;

import java.time.LocalDate;

import com.tsu2track.fitness_tracker.ScheduleStatus;

import jakarta.validation.constraints.Size;

public record UpdateScheduledWorkoutRequest(
    LocalDate date,
    ScheduleStatus status,
    @Size(max = 255) String notes,
    Long sessionId
) {}
