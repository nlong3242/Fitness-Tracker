

public class Main {
    public static void main(String[] args) {
        Exercise bench = new Exercise("Bench Press");

        Workout workoutA = new Workout("Upper");
        workoutA.addExercise(bench);
        System.out.println(workoutA.exercises);

        workoutA.removeExercise(bench);
        System.out.println(workoutA.exercises);
    }
}
