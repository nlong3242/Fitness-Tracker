

public class Main {
    public static void main(String[] args) {
        ExerciseSet set1 = new ExerciseSet(20.25, 10);

        ExerciseSet set2 = new ExerciseSet(20.25, 8);

        Exercise bench = new Exercise("Bench Press");

        bench.addSet(set1);
        bench.addSet(set2);

        System.out.println(bench);

        bench.removeSet(0);

        System.out.println("After:");
        System.out.println(bench);
        
    }
}
