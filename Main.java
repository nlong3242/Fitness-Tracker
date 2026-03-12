

public class Main {
    public static void main(String[] args) {
        Exercise bench = new Exercise("Bench Press");
        Exercise pulldown = new Exercise("Pull down");

        Workout workoutA = new Workout("Upper");
        workoutA.addExercise(bench);
        workoutA.addExercise(pulldown);
        
        System.out.println(workoutA);
        
    }
}
