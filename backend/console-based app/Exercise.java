import java.util.ArrayList;

public class Exercise {
    String name;
    ArrayList<ExerciseSet> sets = new ArrayList<>();
    int id;

    Exercise(String name){
        this.name = name;
    }
    
    void addSet(ExerciseSet set){
        sets.add(set);
    }

    ExerciseSet removeSet(int index){
        ExerciseSet removedSet = sets.remove(index);
        return removedSet;
    }

    @Override
    public String toString(){
        String header = "Exercise: " + this.name;
        
        for (int i = 0; i < this.sets.size(); i++) {
            String set = "\nSet " + (i+1) + ": \n" + this.sets.get(i);
            header += set;
        }
        return header;
    }
}
