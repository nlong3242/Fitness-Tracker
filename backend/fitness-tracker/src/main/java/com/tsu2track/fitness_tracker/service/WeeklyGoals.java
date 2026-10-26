package com.tsu2track.fitness_tracker.service;

import java.time.LocalDate;
import java.util.List;
import java.util.function.Function;

import org.springframework.stereotype.Component;

import com.tsu2track.fitness_tracker.UserProfile;
import com.tsu2track.fitness_tracker.UserProfileRepository;
import com.tsu2track.fitness_tracker.WeeklyGoalChange;
import com.tsu2track.fitness_tracker.WeeklyGoalChangeRepository;
import com.tsu2track.fitness_tracker.security.CurrentUser;

/* The weekly goal each week had (V14), so the streak judges a past week by
   the goal set then. A change counts for the whole week it's made in;
   changing it twice in a week keeps the last. No goal means one workout
   a week. */
@Component
public class WeeklyGoals {
    private final WeeklyGoalChangeRepository changes;
    private final UserProfileRepository profiles;

    public WeeklyGoals(WeeklyGoalChangeRepository changes, UserProfileRepository profiles) {
        this.changes = changes;
        this.profiles = profiles;
    }

    // The logged-in account's goal from weekStart (a Monday) on.
    public void record(LocalDate weekStart, Integer goal) {
        WeeklyGoalChange change = changes.findByUserIdAndWeekStart(CurrentUser.id(), weekStart)
            .orElseGet(() -> new WeeklyGoalChange(weekStart, goal));
        change.setWeeklyGoal(goal);
        changes.save(change);
    }

    /* Workouts needed in the week starting on a given Monday. Without any
       recorded change (none should be missing after V14), the profile's
       goal stands for every week. */
    public Function<LocalDate, Integer> forWeeks() {
        Long userId = CurrentUser.id();
        List<WeeklyGoalChange> all = changes.findByUserIdOrderByWeekStartAsc(userId);
        if (all.isEmpty()) {
            Integer goal = profiles.findById(userId).map(UserProfile::getWeeklyGoal).orElse(null);
            return week -> orOne(goal);
        }
        return week -> {
            Integer goal = null;
            for (WeeklyGoalChange c : all) {
                if (c.getWeekStart().isAfter(week)) break;
                goal = c.getWeeklyGoal();
            }
            return orOne(goal);
        };
    }

    private static int orOne(Integer goal) {
        return goal == null ? 1 : goal;
    }
}
