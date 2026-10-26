package com.tsu2track.fitness_tracker;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.context.annotation.Import;

import com.tsu2track.fitness_tracker.service.ExerciseNotes;
import com.tsu2track.fitness_tracker.service.SessionService;
import com.tsu2track.fitness_tracker.service.WeeklyGoals;

/* findUnfinishedSession drives the frontend's "Resume workout" bar. */
@DataJpaTest
@ExtendWith(LoggedIn.class)
@Import({ SessionService.class, ExerciseNotes.class, WeeklyGoals.class })
class UnfinishedSessionTest {

    @Autowired TestEntityManager em;
    @Autowired SessionService sessionService;

    private Workout workout;

    @BeforeEach
    void setUp() {
        workout = em.persist(new Workout("Upper"));
    }

    @Test
    void emptyWhenEverySessionIsFinished() {
        session(LocalDate.of(2026, 1, 5), true);

        assertThat(sessionService.findUnfinishedSession()).isEmpty();
    }

    @Test
    void returnsTheUnfinishedSession() {
        session(LocalDate.of(2026, 1, 5), true);
        Session open = session(LocalDate.of(2026, 1, 6), false);

        assertThat(sessionService.findUnfinishedSession()).get()
            .extracting(Session::getId).isEqualTo(open.getId());
    }

    @Test
    void mostRecentUnfinishedWinsByDateThenId() {
        session(LocalDate.of(2026, 1, 5), false);
        session(LocalDate.of(2026, 1, 9), false);
        Session latest = session(LocalDate.of(2026, 1, 9), false);
        session(LocalDate.of(2026, 1, 12), true); // newer but finished

        assertThat(sessionService.findUnfinishedSession()).get()
            .extracting(Session::getId).isEqualTo(latest.getId());
    }

    private Session session(LocalDate date, boolean finished) {
        Session s = new Session();
        s.setWorkout(workout);
        s.setDate(date);
        s.setFinished(finished);
        Session saved = em.persist(s);
        em.flush();
        return saved;
    }
}
