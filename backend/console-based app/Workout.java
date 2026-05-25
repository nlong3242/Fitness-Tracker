import java.util.ArrayList;

public class Workout {
    String workout_name;
    ArrayList<Exercise> exercises = new ArrayList<>();
    int id;

    Workout(String workout_name){
        this.workout_name  = workout_name;
    }

    void addExercise(Exercise exercise){
        exercises.add(exercise);
    }

    Exercise removeExercise(int index){
        Exercise removedExercise = exercises.remove(index);
        return removedExercise;
    }
    
    @Override
    public String toString(){
        String header = "Workout: " + this.workout_name +"\n----\nExercises:";

        if (exercises.isEmpty())
            header += "\nNo exercises yet";
        
        else{
            for (int i = 0; i < exercises.size(); i++){
                header += "\n" + (i + 1) +". " + exercises.get(i).name;
            }
        }
        return header;
    }
}
