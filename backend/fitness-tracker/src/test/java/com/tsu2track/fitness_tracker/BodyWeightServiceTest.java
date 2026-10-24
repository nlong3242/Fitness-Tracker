package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.web.server.ResponseStatusException;

import com.tsu2track.fitness_tracker.service.BodyWeightService;
import com.tsu2track.fitness_tracker.service.BodyWeightService.Summary;

/* Bodyweight log: one entry per day, and the Home tile summary (latest
   weigh-in, change vs the last weigh-in at least a week earlier). */
@DataJpaTest
@Import(BodyWeightService.class)
class BodyWeightServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 25);

    @Autowired BodyWeightService service;
    @Autowired BodyWeightRepository repository;

    @Test
    void loggingTheSameDayAgainReplacesIt() {
        service.log(TODAY, 72.4);
        service.log(TODAY, 72.1);

        assertThat(repository.findAll()).singleElement()
            .extracting(BodyWeight::getWeightKg).isEqualTo(72.1);
    }

    @Test
    void historyIsEveryWeighInOldestFirst() {
        service.log(TODAY, 72.0);
        service.log(TODAY.minusDays(9), 73.1);
        service.log(TODAY.minusDays(2), 72.6);

        assertThat(service.history()).extracting(BodyWeight::getDate)
            .containsExactly(TODAY.minusDays(9), TODAY.minusDays(2), TODAY);
    }

    @Test
    void storesOneDecimalPlace() {
        assertThat(service.log(TODAY, 72.46).getWeightKg()).isEqualTo(72.5);
    }

    @Test
    void summaryIsEmptyWithNothingLogged() {
        Summary s = service.summary(TODAY);
        assertThat(s.latest()).isNull();
        assertThat(s.weekChange()).isNull();
    }

    @Test
    void latestIgnoresEntriesAfterToday() {
        service.log(TODAY.minusDays(2), 72.0);
        service.log(TODAY.plusDays(1), 99.0);

        assertThat(service.summary(TODAY).latest().getDate()).isEqualTo(TODAY.minusDays(2));
    }

    @Test
    void weekChangeComparesWithTheLastWeighInAWeekOrMoreBefore() {
        service.log(TODAY.minusDays(10), 74.0);
        service.log(TODAY.minusDays(8), 73.0);  // last one >= 7 days before latest
        service.log(TODAY.minusDays(3), 72.8);  // too recent to compare with
        service.log(TODAY, 72.4);

        assertThat(service.summary(TODAY).weekChange()).isEqualTo(-0.6);
    }

    @Test
    void exactlySevenDaysCounts() {
        service.log(TODAY.minusDays(7), 71.5);
        service.log(TODAY, 72.0);

        assertThat(service.summary(TODAY).weekChange()).isEqualTo(0.5);
    }

    @Test
    void noWeekChangeWithoutAWeekOfHistory() {
        service.log(TODAY.minusDays(6), 73.0);
        service.log(TODAY, 72.4);

        assertThat(service.summary(TODAY).weekChange()).isNull();
    }

    @Test
    void deleteRemovesTheDayAndReportsAMissingOne() {
        service.log(TODAY, 72.4);
        service.delete(TODAY);

        assertThat(repository.findAll()).isEmpty();
        assertThatThrownBy(() -> service.delete(TODAY)).isInstanceOf(ResponseStatusException.class);
    }
}
