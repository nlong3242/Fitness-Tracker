import java.util.ArrayList;

public class Workout {
    String workout_name;
    ArrayList<Exercise> exercises = new ArrayList();
    
    Workout(String workout_name){
        this.workout_name  = workout_name;
    }

    void addExercise(Exercise exercise){
        exercises.add(exercise);
        System.out.println(exercise.name + " added");
    }

    void removeExercise(Exercise exercise){
        exercises.remove(exercise);
        System.out.println(exercise.name + " removed");
    }
    
}
