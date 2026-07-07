package com.tsu2track.fitness_tracker.dto;

import java.time.LocalDate;

import com.tsu2track.fitness_tracker.ScheduleStatus;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateScheduledWorkoutRequest(
    @NotNull LocalDate date,
    @NotNull Long workoutId,
    @Size(max = 255) String notes,
    ScheduleStatus status,
    Long sessionId
) {}
