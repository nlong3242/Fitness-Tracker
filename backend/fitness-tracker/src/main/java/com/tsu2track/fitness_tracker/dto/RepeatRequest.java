package com.tsu2track.fitness_tracker.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

// Exactly one of weekdays (bit 0 = Monday ... bit 6 = Sunday) or everyDays.
// startDate defaults to today and can't be in the past; endDate is optional.
public record RepeatRequest(
    @Min(1) @Max(127) Integer weekdays,
    @Min(1) @Max(365) Integer everyDays,
    LocalDate startDate,
    LocalDate endDate
) {}
