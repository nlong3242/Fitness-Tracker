package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;

import com.tsu2track.fitness_tracker.security.CurrentUser;

/* The repeat-rule table (V15): owner, the weekly / every-N-days check,
   the date-range lookup and removal with its workout. */
@DataJpaTest
@ExtendWith(LoggedIn.class)
class WorkoutRepeatRepositoryTest {

    private static final LocalDate MON = LocalDate.of(2026, 3, 2);
    private static final int MON_THU = 0b0001001;

    @Autowired WorkoutRepeatRepository repeats;
    @Autowired WorkoutRepository workouts;
    @Autowired AppUserRepository users;
    @Autowired TestEntityManager em;

    private Workout workout;

    @BeforeEach
    void setUp() {
        workout = workouts.save(new Workout("Upper"));
    }

    @Test
    void savesAWeeklyRuleForTheLoggedInAccount() {
        WorkoutRepeat saved = repeats.saveAndFlush(weekly(MON, null));

        assertThat(saved.getUserId()).isEqualTo(CurrentUser.id());
        assertThat(saved.getWorkoutId()).isEqualTo(workout.getId());
        assertThat(saved.getWeekdays()).isEqualTo(MON_THU);
        assertThat(saved.getCreatedAt()).isNotNull();
    }

    @Test
    void aRuleIsEitherWeeklyOrEveryNDays() {
        WorkoutRepeat both = weekly(MON, null);
        both.setEveryDays(3);
        assertThatThrownBy(() -> repeats.saveAndFlush(both)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aRuleNeedsOneKind() {
        WorkoutRepeat neither = weekly(MON, null);
        neither.setWeekdays(null);
        assertThatThrownBy(() -> repeats.saveAndFlush(neither)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void noDaysOrAZeroIntervalIsRejected() {
        WorkoutRepeat noDays = weekly(MON, null);
        noDays.setWeekdays(0);
        assertThatThrownBy(() -> repeats.saveAndFlush(noDays)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void endBeforeStartIsRejected() {
        assertThatThrownBy(() -> repeats.saveAndFlush(weekly(MON, MON.minusDays(1))))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void findsOnlyRulesOverlappingTheRange() {
        WorkoutRepeat ended = repeats.save(weekly(MON, MON.plusDays(6)));
        WorkoutRepeat open = repeats.save(everyDays(MON.plusDays(7), 2));
        WorkoutRepeat later = repeats.save(everyDays(MON.plusDays(30), 2));

        assertThat(repeats.findOverlapping(CurrentUser.id(), MON.plusDays(6), MON.plusDays(10)))
            .containsExactly(ended, open);
        assertThat(repeats.findOverlapping(CurrentUser.id(), MON.plusDays(40), MON.plusDays(50)))
            .containsExactly(open, later);
        assertThat(later.getId()).isNotNull();
    }

    @Test
    void anotherAccountSeesNoRules() {
        repeats.save(weekly(MON, null));

        LoggedIn.as(LoggedIn.newUser(users));
        assertThat(repeats.findOverlapping(CurrentUser.id(), MON, MON.plusDays(30))).isEmpty();
    }

    @Test
    void deletingTheWorkoutDeletesItsRules() {
        repeats.save(weekly(MON, null));
        // A fresh load, as a request would see it, so the rule list is filled.
        em.flush();
        em.clear();

        Workout reloaded = workouts.findById(workout.getId()).orElseThrow();
        workouts.delete(reloaded);
        workouts.flush();

        assertThat(repeats.findAll()).isEmpty();
    }

    private WorkoutRepeat weekly(LocalDate start, LocalDate end) {
        WorkoutRepeat r = new WorkoutRepeat();
        r.setWorkout(workout);
        r.setStartDate(start);
        r.setEndDate(end);
        r.setWeekdays(MON_THU);
        return r;
    }

    private WorkoutRepeat everyDays(LocalDate start, int n) {
        WorkoutRepeat r = new WorkoutRepeat();
        r.setWorkout(workout);
        r.setStartDate(start);
        r.setEveryDays(n);
        return r;
    }
}
