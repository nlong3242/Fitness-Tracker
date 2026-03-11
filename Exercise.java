import java.util.ArrayList;

public class Exercise {
    String name;
    ArrayList<ExerciseSet> sets = new ArrayList<>();

    Exercise(String name){
        this.name = name;
    }
    
    void addSet(ExerciseSet set){
        sets.add(set);
        System.out.println("Set added")
    }
}
